//! Máquina de modos. O Rust é a fonte da verdade: a UI recebe um retrato
//! (`DeckSnapshot`) e pede mudanças por comando. Toda mudança é validada e
//! gravada antes de virar estado em memória, então nunca existe divergência
//! entre o que está na tela e o que está no disco.

use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::model::{
    new_id, normalize_key, Action, ActionPayload, Config, General, LayoutPreset, Mode, ModeColor,
    Span, MAX_MODES,
};
use crate::config::ConfigStore;
use crate::error::DeckError;

pub const DECK_CHANGED_EVENT: &str = "deck://changed";

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DeckSnapshot {
    pub config: Config,
    pub config_path: String,
    /// Problemas que não impedem o uso: arquivo de som ausente, config
    /// recuperada de backup. Aparecem como aviso, não como erro de tela.
    pub warnings: Vec<DeckError>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NewMode {
    pub name: String,
    pub color: ModeColor,
    pub layout: LayoutPreset,
    #[serde(default)]
    pub columns: u8,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ModeEdit {
    pub id: String,
    pub name: String,
    pub color: ModeColor,
    pub layout: LayoutPreset,
    #[serde(default)]
    pub columns: u8,
}

/// Criar ou editar uma ação. Sem `id` é criação.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ActionInput {
    pub id: Option<String>,
    pub label: String,
    /// Aceita qualquer grafia (`ctrl+home`); a forma canônica é gravada.
    pub key: String,
    pub payload: ActionPayload,
    #[serde(default)]
    pub icon: Option<String>,
}

pub struct DeckState {
    inner: Mutex<Deck>,
}

struct Deck {
    store: ConfigStore,
    config: Config,
    warnings: Vec<DeckError>,
}

impl DeckState {
    /// Cópia da config atual, para quem só precisa ler (o motor).
    pub fn config(&self) -> Config {
        match self.inner.lock() {
            Ok(deck) => deck.config.clone(),
            Err(poisoned) => poisoned.into_inner().config.clone(),
        }
    }

    /// Carrega do disco. Se nem isso for possível, o app abre com a semente e
    /// carrega o problema como aviso — um arquivo com permissão errada não
    /// pode virar tela branca.
    pub fn bootstrap() -> Self {
        let store = ConfigStore::discover();
        let (config, warnings) = match store.load() {
            Ok(outcome) => {
                let warnings = outcome.warnings;
                if let Some(path) = outcome.backup_path {
                    log::warn!("config anterior preservada em {path}");
                }
                (outcome.config, warnings)
            }
            Err(error) => {
                log::error!("não foi possível carregar a config: {error}");
                let mut warnings = vec![error];
                warnings.push(DeckError::new("config.runningOnDefaults"));
                (Config::default(), warnings)
            }
        };

        Self {
            inner: Mutex::new(Deck {
                store,
                config,
                warnings,
            }),
        }
    }
}

impl Deck {
    fn snapshot(&self) -> DeckSnapshot {
        let mut warnings = self.warnings.clone();
        warnings.extend(missing_sounds(&self.config));
        DeckSnapshot {
            config: self.config.clone(),
            config_path: self.store.path().display().to_string(),
            warnings,
        }
    }
}

/// Aviso, não erro: o arquivo pode aparecer depois, e o usuário pode estar com
/// um pendrive desconectado. Só o momento de tocar é que decide.
fn missing_sounds(config: &Config) -> Vec<DeckError> {
    let mut warnings = Vec::new();
    for mode in &config.modes {
        for action in &mode.actions {
            if let ActionPayload::Sound { file, .. } = &action.payload {
                if !Path::new(file).is_file() {
                    warnings.push(DeckError::with_detail(
                        "action.soundFileNotFound",
                        format!("{}: {file}", action.label),
                    ));
                }
            }
        }
    }
    warnings
}

fn lock<'a>(state: &'a State<'_, DeckState>) -> Result<std::sync::MutexGuard<'a, Deck>, DeckError> {
    state
        .inner
        .lock()
        .map_err(|_| DeckError::new("state.poisoned"))
}

/// Troca de modo é o gesto que o HUD existe para confirmar.
fn show_overlay_if_enabled(app: &AppHandle, snapshot: &DeckSnapshot) {
    let overlay = &snapshot.config.general.overlay;
    if !(overlay.enabled && overlay.show_on_mode_change) {
        return;
    }
    // A tecla de modo "afunda" no HUD: o gesto e a confirmação ficam ligados.
    crate::platform::overlay::fire_hud(app, Some(snapshot.config.general.mode_key.clone()));
}

fn emit(app: &AppHandle, snapshot: &DeckSnapshot) {
    crate::platform::tray::refresh(app, &snapshot.config.general);
    if let Err(error) = app.emit(DECK_CHANGED_EVENT, snapshot) {
        log::warn!("falha ao emitir {DECK_CHANGED_EVENT}: {error}");
    }
}

/// Aplica uma mudança em cópia, valida, grava e só então publica. Devolve o
/// retrato novo e avisa todo mundo que estiver escutando.
fn mutate(
    app: &AppHandle,
    state: &State<'_, DeckState>,
    apply: impl FnOnce(&mut Config) -> Result<(), DeckError>,
) -> Result<DeckSnapshot, DeckError> {
    let mut deck = lock(state)?;
    let mut next = deck.config.clone();
    apply(&mut next)?;
    next.validate()?;
    deck.store.save(&next)?;
    deck.config = next;
    let snapshot = deck.snapshot();
    drop(deck);
    emit(app, &snapshot);
    // Teclas novas, removidas ou captura ligada/desligada: o motor reconcilia.
    crate::engine::request_sync(app);
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub fn deck_snapshot(state: State<'_, DeckState>) -> Result<DeckSnapshot, DeckError> {
    let deck = lock(&state)?;
    Ok(deck.snapshot())
}

/// Próximo (`1`) ou anterior (`-1`) modo. Usada pelo comando e pelo motor.
pub fn cycle(
    app: &AppHandle,
    state: &State<'_, DeckState>,
    step: isize,
) -> Result<DeckSnapshot, DeckError> {
    let snapshot = mutate(app, state, |config| {
        let total = config.modes.len();
        if total == 0 {
            return Err(DeckError::new("config.noModes"));
        }
        let current = config
            .modes
            .iter()
            .position(|mode| mode.id == config.active_mode)
            .unwrap_or(0) as isize;
        let next = (current + step).rem_euclid(total as isize) as usize;
        config.active_mode = config.modes[next].id.clone();
        Ok(())
    })?;
    show_overlay_if_enabled(app, &snapshot);
    Ok(snapshot)
}

/// `direction` é 1 para o próximo modo e -1 para o anterior; qualquer outro
/// valor é normalizado, porque a origem é uma tecla.
#[tauri::command]
#[specta::specta]
pub fn deck_cycle_mode(
    app: AppHandle,
    state: State<'_, DeckState>,
    direction: i8,
) -> Result<DeckSnapshot, DeckError> {
    cycle(&app, &state, if direction < 0 { -1 } else { 1 })
}

#[tauri::command]
#[specta::specta]
pub fn deck_activate_mode(
    app: AppHandle,
    state: State<'_, DeckState>,
    id: String,
) -> Result<DeckSnapshot, DeckError> {
    let snapshot = mutate(&app, &state, |config| {
        if config.mode(&id).is_none() {
            return Err(DeckError::with_detail("mode.notFound", id.clone()));
        }
        config.active_mode = id.clone();
        Ok(())
    })?;
    show_overlay_if_enabled(&app, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
#[specta::specta]
pub fn deck_create_mode(
    app: AppHandle,
    state: State<'_, DeckState>,
    input: NewMode,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        if config.modes.len() >= MAX_MODES {
            return Err(DeckError::with_detail(
                "mode.limitReached",
                format!("{MAX_MODES} modos"),
            ));
        }
        let mode = Mode {
            id: new_id("mode"),
            name: input.name.trim().to_string(),
            color: input.color,
            layout: input.layout,
            columns: input.columns,
            actions: Vec::new(),
        };
        config.modes.push(mode);
        Ok(())
    })
}

#[tauri::command]
#[specta::specta]
pub fn deck_update_mode(
    app: AppHandle,
    state: State<'_, DeckState>,
    input: ModeEdit,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        let mode = config
            .modes
            .iter_mut()
            .find(|mode| mode.id == input.id)
            .ok_or_else(|| DeckError::with_detail("mode.notFound", input.id.clone()))?;
        mode.name = input.name.trim().to_string();
        mode.color = input.color;
        mode.layout = input.layout;
        mode.columns = input.columns;
        Ok(())
    })
}

#[tauri::command]
#[specta::specta]
pub fn deck_delete_mode(
    app: AppHandle,
    state: State<'_, DeckState>,
    id: String,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        if config.modes.len() <= 1 {
            return Err(DeckError::new("mode.lastOne"));
        }
        let index = config
            .modes
            .iter()
            .position(|mode| mode.id == id)
            .ok_or_else(|| DeckError::with_detail("mode.notFound", id.clone()))?;
        config.modes.remove(index);
        if config.active_mode == id {
            let fallback = index.saturating_sub(1).min(config.modes.len() - 1);
            config.active_mode = config.modes[fallback].id.clone();
        }
        Ok(())
    })
}

#[tauri::command]
#[specta::specta]
pub fn deck_save_general(
    app: AppHandle,
    state: State<'_, DeckState>,
    general: General,
) -> Result<DeckSnapshot, DeckError> {
    let snapshot = mutate(&app, &state, |config| {
        let mut general = general;
        general.mode_key = normalize_key(&general.mode_key)
            .map_err(|reason| DeckError::with_detail("general.modeKeyInvalid", reason))?;
        config.general = general;
        Ok(())
    })?;
    // O arquivo de início automático segue a config. Falhar aqui não desfaz a
    // preferência salva: vira log, e a próxima abertura tenta de novo.
    if let Err(error) = crate::platform::autostart::sync(&app, &snapshot.config.general) {
        log::warn!("início automático: {error}");
    }
    Ok(snapshot)
}

/// Lê um arquivo de deck ou de tema. O limite evita carregar na memória um
/// arquivo qualquer (ou gigante) escolhido por engano.
fn read_small_file(path: &str) -> Result<String, DeckError> {
    const MAX_BYTES: u64 = 2 * 1024 * 1024;
    let read_error = |error: std::io::Error| DeckError::with_detail("config.readFailed", format!("{path}: {error}"));
    let size = std::fs::metadata(path).map_err(read_error)?.len();
    if size > MAX_BYTES {
        return Err(DeckError::with_detail("config.parseFailed", "o arquivo é grande demais para ser um deck"));
    }
    std::fs::read_to_string(path).map_err(read_error)
}

fn clean_icon(icon: Option<String>) -> Option<String> {
    icon.map(|value| value.trim().to_string()).filter(|value| !value.is_empty())
}

#[tauri::command]
#[specta::specta]
pub fn deck_save_action(
    app: AppHandle,
    state: State<'_, DeckState>,
    mode_id: String,
    input: ActionInput,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        let key = normalize_key(&input.key)
            .map_err(|reason| DeckError::with_detail("action.keyInvalid", reason))?;
        let mode = config
            .modes
            .iter_mut()
            .find(|mode| mode.id == mode_id)
            .ok_or_else(|| DeckError::with_detail("mode.notFound", mode_id.clone()))?;

        let label = input.label.trim().to_string();
        match input.id {
            Some(id) => {
                let action = mode
                    .actions
                    .iter_mut()
                    .find(|action| action.id == id)
                    .ok_or_else(|| DeckError::with_detail("action.notFound", id.clone()))?;
                action.label = label;
                action.key = key;
                action.payload = input.payload;
                action.icon = clean_icon(input.icon);
            }
            None => mode.actions.push(Action {
                id: new_id("action"),
                label,
                key,
                span: Span::default(),
                payload: input.payload,
                icon: clean_icon(input.icon),
            }),
        }
        Ok(())
    })
}

#[tauri::command]
#[specta::specta]
pub fn deck_delete_action(
    app: AppHandle,
    state: State<'_, DeckState>,
    mode_id: String,
    action_id: String,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        let mode = config
            .modes
            .iter_mut()
            .find(|mode| mode.id == mode_id)
            .ok_or_else(|| DeckError::with_detail("mode.notFound", mode_id.clone()))?;
        let before = mode.actions.len();
        mode.actions.retain(|action| action.id != action_id);
        if mode.actions.len() == before {
            return Err(DeckError::with_detail("action.notFound", action_id.clone()));
        }
        Ok(())
    })
}

/// Liga ou desliga a captura de teclas (menu da bandeja).
pub fn set_capture_enabled(app: &AppHandle, enabled: bool) {
    let state = app.state::<DeckState>();
    if let Err(error) = mutate(app, &state, |config| {
        config.general.capture_enabled = enabled;
        Ok(())
    }) {
        log::warn!("não foi possível mudar a captura: {error:?}");
    }
}

/// Mesmos ids, outra ordem. Qualquer id a mais, a menos ou repetido é recusado:
/// reordenar nunca cria nem apaga nada.
fn reorder<T>(items: &mut Vec<T>, ids: &[String], id_of: impl Fn(&T) -> &str) -> Result<(), DeckError> {
    let mut unique: Vec<&String> = ids.iter().collect();
    unique.sort();
    unique.dedup();
    let same_set = ids.len() == items.len()
        && unique.len() == ids.len()
        && items.iter().all(|item| ids.iter().any(|id| id == id_of(item)));
    if !same_set {
        return Err(DeckError::new("reorder.mismatch"));
    }
    items.sort_by_key(|item| ids.iter().position(|id| id == id_of(item)));
    Ok(())
}

/// A ordem das ações é a ordem em que aparecem no HUD.
#[tauri::command]
#[specta::specta]
pub fn deck_reorder_actions(
    app: AppHandle,
    state: State<'_, DeckState>,
    mode_id: String,
    ids: Vec<String>,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        let mode = config
            .modes
            .iter_mut()
            .find(|mode| mode.id == mode_id)
            .ok_or_else(|| DeckError::with_detail("mode.notFound", mode_id.clone()))?;
        reorder(&mut mode.actions, &ids, |action| action.id.as_str())
    })
}

/// A ordem dos modos é a ordem de ciclo da tecla de modo.
#[tauri::command]
#[specta::specta]
pub fn deck_reorder_modes(
    app: AppHandle,
    state: State<'_, DeckState>,
    ids: Vec<String>,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        reorder(&mut config.modes, &ids, |mode| mode.id.as_str())
    })
}

#[cfg(test)]
mod reorder_tests {
    use super::*;

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn reordena_pelos_ids() {
        let mut items = ids(&["a", "b", "c"]);
        reorder(&mut items, &ids(&["c", "a", "b"]), |s| s.as_str()).unwrap();
        assert_eq!(items, ids(&["c", "a", "b"]));
    }

    #[test]
    fn recusa_id_faltando_extra_ou_repetido() {
        for bad in [ids(&["a", "b"]), ids(&["a", "b", "x"]), ids(&["a", "a", "b"]), ids(&["a", "b", "c", "d"])] {
            let mut items = ids(&["a", "b", "c"]);
            assert!(reorder(&mut items, &bad, |s| s.as_str()).is_err());
            assert_eq!(items, ids(&["a", "b", "c"]));
        }
    }
}

/// Arquivo de exportação: a config dentro de um envelope com versão, para o
/// import reconhecer o que é e recusar o que não é.
const EXPORT_FORMAT: &str = "moondeck-deck";

/// Grava o deck (modos, ações, visual) num arquivo `.json`. Os sons e a imagem
/// ficam por caminho: o arquivo leva a configuração, não as mídias.
#[tauri::command]
#[specta::specta]
pub fn deck_export(state: State<'_, DeckState>, path: String) -> Result<(), DeckError> {
    let config = lock(&state)?.config.clone();
    let envelope = serde_json::json!({
        "format": EXPORT_FORMAT,
        "exportVersion": 1,
        "config": config,
    });
    let text = serde_json::to_string_pretty(&envelope)
        .map_err(|error| DeckError::with_detail("config.writeFailed", error.to_string()))?;
    std::fs::write(&path, text)
        .map_err(|error| DeckError::with_detail("config.writeFailed", format!("{path}: {error}")))
}

/// Lê um deck exportado e o aplica. O que é da máquina (saída e microfone
/// escolhidos, bandeja, início automático, captura) fica como está.
#[tauri::command]
#[specta::specta]
pub fn deck_import(
    app: AppHandle,
    state: State<'_, DeckState>,
    path: String,
) -> Result<DeckSnapshot, DeckError> {
    let text = read_small_file(&path)?;
    let mut value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| DeckError::with_detail("config.parseFailed", error.to_string()))?;
    if value.get("format").and_then(|f| f.as_str()) == Some(EXPORT_FORMAT) {
        value = value
            .get_mut("config")
            .map(serde_json::Value::take)
            .ok_or_else(|| DeckError::new("config.parseFailed"))?;
    }
    let imported = crate::config::migrate::migrate(value)?;

    mutate(&app, &state, |config| {
        let local = config.general.clone();
        *config = imported;
        config.general.audio.sink = local.audio.sink;
        config.general.audio.mic_source = local.audio.mic_source;
        config.general.audio.mic_routing = local.audio.mic_routing;
        config.general.close_to_tray = local.close_to_tray;
        config.general.start_on_boot = local.start_on_boot;
        config.general.start_minimized = local.start_minimized;
        config.general.capture_enabled = local.capture_enabled;
        config.general.onboarding_done = local.onboarding_done;
        Ok(())
    })
}

const THEME_FORMAT: &str = "moondeck-theme";

/// Salva só o visual do overlay (tema, cores, imagem, CSS) para compartilhar.
#[tauri::command]
#[specta::specta]
pub fn theme_export(state: State<'_, DeckState>, path: String) -> Result<(), DeckError> {
    let look = lock(&state)?.config.general.overlay.clone();
    let envelope = serde_json::json!({
        "format": THEME_FORMAT,
        "themeVersion": 1,
        "overlay": look,
    });
    let text = serde_json::to_string_pretty(&envelope)
        .map_err(|error| DeckError::with_detail("config.writeFailed", error.to_string()))?;
    std::fs::write(&path, text)
        .map_err(|error| DeckError::with_detail("config.writeFailed", format!("{path}: {error}")))
}

/// Aplica um tema salvo. Posição, tempo e liga/desliga do overlay ficam como
/// estão: tema é aparência, não comportamento.
#[tauri::command]
#[specta::specta]
pub fn theme_import(
    app: AppHandle,
    state: State<'_, DeckState>,
    path: String,
) -> Result<DeckSnapshot, DeckError> {
    let text = read_small_file(&path)?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| DeckError::with_detail("config.parseFailed", error.to_string()))?;
    if value.get("format").and_then(|f| f.as_str()) != Some(THEME_FORMAT) {
        return Err(DeckError::with_detail("config.parseFailed", "não é um tema do MoonDeck"));
    }
    let theme: crate::config::model::OverlaySettings = serde_json::from_value(
        value.get("overlay").cloned().unwrap_or(serde_json::Value::Null),
    )
    .map_err(|error| DeckError::with_detail("config.parseFailed", error.to_string()))?;

    mutate(&app, &state, |config| {
        let look = &mut config.general.overlay;
        look.preset = theme.preset;
        look.background = theme.background.clone();
        look.accent = theme.accent.clone();
        look.image = theme.image.clone();
        look.image_dim = theme.image_dim;
        look.opacity = theme.opacity;
        look.scale = theme.scale;
        look.custom_css = theme.custom_css.clone();
        look.animation = theme.animation;
        look.timer_style = theme.timer_style;
        look.button_style = theme.button_style;
        look.keys = theme.keys.clone();
        Ok(())
    })
}

/// Guarda o visual atual do overlay como tema do usuário. Mesmo nome = atualiza.
#[tauri::command]
#[specta::specta]
pub fn theme_save(
    app: AppHandle,
    state: State<'_, DeckState>,
    name: String,
    look: crate::config::model::ThemeLook,
) -> Result<DeckSnapshot, DeckError> {
    let name = name.trim().to_string();
    mutate(&app, &state, |config| {
        let themes = &mut config.general.saved_themes;
        match themes.iter_mut().find(|theme| theme.name.eq_ignore_ascii_case(&name)) {
            Some(existing) => existing.look = look.clone(),
            None => themes.push(crate::config::model::SavedTheme {
                id: new_id("theme"),
                name: name.clone(),
                look: look.clone(),
            }),
        }
        Ok(())
    })
}

#[tauri::command]
#[specta::specta]
pub fn theme_delete(
    app: AppHandle,
    state: State<'_, DeckState>,
    id: String,
) -> Result<DeckSnapshot, DeckError> {
    mutate(&app, &state, |config| {
        config.general.saved_themes.retain(|theme| theme.id != id);
        Ok(())
    })
}
