//! Modelo persistido. É a fonte da verdade do app: modos, ações e preferências.
//!
//! Regras que valem para todo o arquivo:
//! - nada de cor livre: a identidade do modo vem de uma paleta fechada, então
//!   claro e escuro continuam legíveis;
//! - nada de estado inválido representável: som, atalho e app são variantes de
//!   um enum etiquetado, não campos opcionais soltos;
//! - nome de modo e rótulo de ação são dados do usuário, não chaves de i18n.

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::DeckError;
use crate::keys::parse_combo;

pub const SCHEMA_VERSION: u32 = 2;
pub const MAX_MODES: usize = 12;
pub const MAX_ACTIONS: usize = 8;
pub const MAX_MODE_NAME: usize = 40;
pub const MAX_ACTION_LABEL: usize = 60;
pub const MAX_HIDE_AFTER_MS: u32 = 15_000;

// --------------------------------------------------------------------- teclas

/// Tecla do deck, no formato do portal GlobalShortcuts: nome XKB com
/// modificadores opcionais (`Home`, `Page_Up`, `F13`, `CTRL+Home`).
///
/// É texto livre de propósito: qualquer tecla que o usuário tenha — de macro,
/// do numpad, de mídia — pode virar gatilho. A forma canônica sai de
/// [`normalize_key`]; o que está salvo em disco sempre passou por ela.
pub type KeyName = String;

const KEY_MODIFIERS: [&str; 4] = ["CTRL", "ALT", "SHIFT", "LOGO"];
const MAX_KEY_LEN: usize = 48;

/// Valida e devolve a forma canônica: modificadores em ordem fixa e em caixa
/// alta, nome da tecla como veio. `ctrl+home` e `Home+Ctrl` viram `CTRL+Home`.
pub fn normalize_key(raw: &str) -> Result<KeyName, String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return Err("tecla vazia".to_string());
    }
    if raw.len() > MAX_KEY_LEN {
        return Err("nome de tecla longo demais".to_string());
    }

    let mut modifiers: Vec<&'static str> = Vec::new();
    let mut main: Option<&str> = None;

    for part in raw.split('+').map(str::trim) {
        if part.is_empty() {
            return Err("há um '+' sobrando".to_string());
        }
        let upper = part.to_ascii_uppercase();
        let as_modifier = match upper.as_str() {
            "CTRL" | "CONTROL" => Some("CTRL"),
            "ALT" => Some("ALT"),
            "SHIFT" => Some("SHIFT"),
            "LOGO" | "SUPER" | "META" | "WIN" => Some("LOGO"),
            _ => None,
        };
        match as_modifier {
            Some(modifier) => {
                if !modifiers.contains(&modifier) {
                    modifiers.push(modifier);
                }
            }
            None => {
                if main.replace(part).is_some() {
                    return Err("só uma tecla além dos modificadores".to_string());
                }
            }
        }
    }

    let Some(main) = main else {
        return Err("falta a tecla (só há modificadores)".to_string());
    };
    if !main
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(format!("nome de tecla inválido: {main}"));
    }

    modifiers.sort_by_key(|m| KEY_MODIFIERS.iter().position(|k| k == m));
    let mut out = String::new();
    for modifier in modifiers {
        out.push_str(modifier);
        out.push('+');
    }
    out.push_str(main);
    Ok(out)
}

/// `#RRGGBB`, nada além disso: o valor vai parar num atributo CSS.
pub fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..].chars().all(|c| c.is_ascii_hexdigit())
}

pub fn same_key(a: &str, b: &str) -> bool {
    a.eq_ignore_ascii_case(b)
}

// ---------------------------------------------------------------------- cores

/// Paleta fechada de identidade dos modos. Os valores vivem em CSS
/// (`--mode-*`), um par por tema; o Rust guarda só o nome.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ModeColor {
    Sky,
    Sage,
    Teal,
    Slate,
    Rose,
    Clay,
    Sand,
    Ash,
}

// --------------------------------------------------------------------- layout

/// Como o deck se organiza na camada. O preset é por modo, porque cada camada
/// tem um ritmo próprio: soundboard em grade, atalhos em linha.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LayoutPreset {
    Row,
    Column,
    Grid,
    Arc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Span {
    pub cols: u8,
    pub rows: u8,
}

impl Default for Span {
    fn default() -> Self {
        Self { cols: 1, rows: 1 }
    }
}

// -------------------------------------------------------------------- payload

pub const MAX_MACRO_STEPS: usize = 20;
pub const MAX_MACRO_WAIT_MS: u32 = 30_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MacroStep {
    #[serde(rename_all = "camelCase")]
    Shortcut { combo: String },
    #[serde(rename_all = "camelCase")]
    Wait { ms: u32 },
    /// Toca um som inteiro, no volume do arquivo.
    #[serde(rename_all = "camelCase")]
    Sound { file: String },
}

/// Efeitos de voz em tempo real (`platform::mic`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum VoiceEffect {
    Deep,
    High,
    Robot,
    Echo,
    Monster,
    Chipmunk,
    Radio,
    Whisper,
    Distortion,
    Cave,
    Alien,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ActionPayload {
    /// Toca um arquivo de áudio no sink escolhido.
    #[serde(rename_all = "camelCase")]
    Sound {
        file: String,
        /// 0–200 (%). Acima de 100 reforça um som baixo (o resultado é limitado
        /// para não estourar). Inteiro para não virar `number | null`.
        volume: u16,
        stop_others: bool,
        /// Início do trecho, em ms. Soundboard quase sempre quer cortar o silêncio.
        #[serde(default)]
        start_ms: u32,
        /// Fim do trecho, em ms. 0 = até o fim do arquivo.
        #[serde(default)]
        end_ms: u32,
        #[serde(default)]
        fade_in_ms: u32,
        #[serde(default)]
        fade_out_ms: u32,
    },
    /// Injeta uma combinação de teclas na janela em foco.
    #[serde(rename_all = "camelCase")]
    Shortcut { combo: String },
    /// Liga/desliga um efeito na sua voz (precisa do microfone virtual).
    #[serde(rename_all = "camelCase")]
    Voice {
        effect: VoiceEffect,
        /// Push-to-talk: o efeito vale só enquanto a tecla está apertada.
        #[serde(default)]
        hold: bool,
    },
    /// Uma sequência de passos, um depois do outro.
    #[serde(rename_all = "camelCase")]
    Macro { steps: Vec<MacroStep> },
    /// Abre um programa, sem passar por shell.
    #[serde(rename_all = "camelCase")]
    App { command: String, args: Vec<String> },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    pub id: String,
    pub label: String,
    /// Tecla que dispara este item (forma canônica, ver [`normalize_key`]).
    pub key: KeyName,
    pub span: Span,
    pub payload: ActionPayload,
    /// Imagem do botão: um emoji/texto curto ou o caminho de uma imagem/gif.
    /// `None` = automático (o ícone do app, quando a ação abre um).
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Mode {
    pub id: String,
    pub name: String,
    pub color: ModeColor,
    pub layout: LayoutPreset,
    /// Colunas do cartão no overlay. 0 = automático (se adapta ao que couber).
    #[serde(default)]
    pub columns: u8,
    pub actions: Vec<Action>,
}

// ------------------------------------------------------------------ preferências

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ThemePreference {
    System,
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum LocalePreference {
    System,
    PtBr,
    En,
}

/// Onde o HUD aparece na tela.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum OverlayPosition {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    Center,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

pub const MAX_OVERLAY_MARGIN: u16 = 600;

/// Visual pronto do HUD. As cores próprias (`background`, `accent`) valem por
/// cima do preset.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum OverlayPreset {
    Midnight,
    Paper,
    Forest,
    Dusk,
}

pub const MAX_IMAGE_DIM: u8 = 90;
pub const MIN_OVERLAY_OPACITY: u8 = 40;
pub const MIN_OVERLAY_SCALE: u8 = 70;
pub const MAX_OVERLAY_SCALE: u8 = 140;
pub const MAX_GRID_COLUMNS: u8 = 6;
pub const MAX_ICON_LEN: usize = 1024;
pub const MAX_APP_ARGS: usize = 32;
pub const MAX_CUSTOM_CSS: usize = 20_000;

/// CSS próprio do cartão. É código do próprio usuário, mas um tema importado
/// de terceiros não pode buscar nada na rede nem puxar outro CSS: só valem
/// regras locais. Imagens só como `url(data:…)` embutido; qualquer outro
/// endereço (`http:`, `//`, `image-set("…")`, `@import`) é recusado.
pub fn check_custom_css(css: &str) -> Result<(), DeckError> {
    let invalid = |reason: String| DeckError::with_detail("general.customCssInvalid", reason);
    if css.len() > MAX_CUSTOM_CSS {
        return Err(invalid(format!("{} caracteres; máximo {MAX_CUSTOM_CSS}", css.len())));
    }
    // Tira as imagens embutidas (`url("data:…")`): o resto não pode ter endereço.
    let mut rest = String::with_capacity(css.len());
    let lower_all = css.to_ascii_lowercase();
    let mut cursor = 0;
    while let Some(found) = lower_all[cursor..].find("url(") {
        let start = cursor + found;
        rest.push_str(&css[cursor..start]);
        let after = css[start + 4..].trim_start();
        let body = after.trim_start_matches(['"', '\'']);
        if !body.to_ascii_lowercase().starts_with("data:") {
            return Err(invalid("url() só aceita imagens embutidas (data:)".to_string()));
        }
        // `(` e `)` dentro da imagem vêm codificados; o primeiro `)` fecha.
        let Some(end) = css[start..].find(')') else {
            return Err(invalid("url( sem fechar".to_string()));
        };
        cursor = start + end + 1;
    }
    rest.push_str(&css[cursor..]);
    let squashed = rest.to_ascii_lowercase().replace(char::is_whitespace, "");
    let forbidden = [
        "@import", "@font-face", "http:", "https:", "//", "expression(", "javascript:", "</style",
        "image-set(", "-webkit-image-set(", "src(", "image(", "cross-fade(", "element(",
    ];
    if let Some(hit) = forbidden.iter().find(|bad| squashed.contains(**bad)) {
        return Err(invalid(format!("não é permitido: {hit}")));
    }
    Ok(())
}

/// Como o cartão entra e sai.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum OverlayAnimation {
    #[default]
    Fade,
    Slide,
    Scale,
    Pop,
    None,
}

/// Como o tempo que falta para o overlay sumir é mostrado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum TimerStyle {
    #[default]
    Bar,
    Ring,
    None,
}

/// Forma dos botões no cartão.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ButtonStyle {
    /// Linha: tecla, nome (o padrão de antes).
    #[default]
    Row,
    /// Quadrado de tecla: imagem no meio, nome da tecla no canto.
    Tile,
}

/// Formato das teclas desenhadas no overlay (PGUP, END…).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum KeyShape {
    #[default]
    Default,
    Square,
    Round,
    Pill,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum KeySize {
    Sm,
    #[default]
    Md,
    Lg,
}

/// Cores e forma das teclas e do texto do cartão. `None` = a do tema.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct KeyLook {
    /// Cor do texto do cartão.
    pub text: Option<String>,
    pub key_bg: Option<String>,
    pub key_fg: Option<String>,
    /// Cor da tecla (e do botão) quando acabou de ser apertada.
    pub key_pressed: Option<String>,
    pub key_shape: KeyShape,
    pub key_size: KeySize,
}

impl KeyLook {
    fn colors(&self) -> [&Option<String>; 4] {
        [&self.text, &self.key_bg, &self.key_fg, &self.key_pressed]
    }
}

/// O visual de um tema (sem imagem de fundo, que é um caminho da máquina).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ThemeLook {
    pub preset: OverlayPreset,
    pub background: Option<String>,
    pub accent: Option<String>,
    pub image_dim: u8,
    pub opacity: u8,
    pub custom_css: String,
    pub animation: OverlayAnimation,
    pub timer_style: TimerStyle,
    pub button_style: ButtonStyle,
    pub keys: KeyLook,
}

impl Default for ThemeLook {
    fn default() -> Self {
        let base = OverlaySettings::default();
        Self {
            preset: base.preset,
            background: None,
            accent: None,
            image_dim: base.image_dim,
            opacity: base.opacity,
            custom_css: String::new(),
            animation: OverlayAnimation::Fade,
            timer_style: TimerStyle::Bar,
            button_style: ButtonStyle::Row,
            keys: KeyLook::default(),
        }
    }
}

/// Um tema guardado pelo usuário.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SavedTheme {
    pub id: String,
    pub name: String,
    pub look: ThemeLook,
}

pub const MAX_SAVED_THEMES: usize = 40;
pub const MAX_THEME_NAME: usize = 40;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct OverlaySettings {
    pub enabled: bool,
    /// Mostrar a camada ao trocar de modo e esconder sozinha.
    pub show_on_mode_change: bool,
    /// 0 significa "ficar aberta até fechar".
    pub hide_after_ms: u32,
    pub position: OverlayPosition,
    /// Distância da borda da tela, em px.
    pub margin: u16,
    pub preset: OverlayPreset,
    /// Cor de fundo própria (`#RRGGBB`). `None` = a do preset.
    pub background: Option<String>,
    /// Cor de destaque própria (`#RRGGBB`). `None` = a do preset.
    pub accent: Option<String>,
    /// Imagem de fundo (caminho de arquivo). `None` = sem imagem.
    pub image: Option<String>,
    /// Quanto a cor de fundo escurece a imagem, 0–90 (%): garante a leitura.
    pub image_dim: u8,
    /// Opacidade do cartão, 40–100 (%).
    pub opacity: u8,
    /// Tamanho do cartão, 70–140 (%).
    pub scale: u8,
    /// CSS próprio aplicado ao cartão (ver `docs/design.md`). Só local.
    pub custom_css: String,
    pub animation: OverlayAnimation,
    pub timer_style: TimerStyle,
    pub button_style: ButtonStyle,
    pub keys: KeyLook,
}

impl Default for OverlaySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            show_on_mode_change: true,
            hide_after_ms: 2_000,
            position: OverlayPosition::BottomCenter,
            margin: 40,
            preset: OverlayPreset::Midnight,
            background: None,
            accent: None,
            image: None,
            image_dim: 55,
            opacity: 92,
            scale: 100,
            custom_css: String::new(),
            animation: OverlayAnimation::Fade,
            timer_style: TimerStyle::Bar,
            button_style: ButtonStyle::Row,
            keys: KeyLook::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct AudioSettings {
    /// `None` = sink padrão do sistema.
    pub sink: Option<String>,
    /// 0–100.
    pub volume: u8,
    pub stop_previous_sound: bool,
    /// Mantém a saída de som "acordada" com um fluxo de silêncio. Caixas e fones
    /// Bluetooth entram em repouso e comem o começo do primeiro som.
    pub keep_awake: bool,
    /// Cria o "MoonDeck Mic" (um microfone virtual com a sua voz + os sons) e
    /// manda os sons também para ele.
    pub mic_routing: bool,
    /// Ouvir a própria voz (com efeito) nos alto-falantes, para testar. Use fones.
    pub mic_monitor: bool,
    /// Microfone real que alimenta o MoonDeck Mic. `None` = o padrão do sistema.
    pub mic_source: Option<String>,
}

impl Default for AudioSettings {
    fn default() -> Self {
        Self {
            sink: None,
            volume: 80,
            stop_previous_sound: true,
            keep_awake: true,
            mic_routing: false,
            mic_monitor: false,
            mic_source: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct General {
    /// Tecla que troca de modo.
    pub mode_key: KeyName,
    /// Desliga a captura global sem fechar o app: as teclas voltam ao normal.
    pub capture_enabled: bool,
    pub theme: ThemePreference,
    pub locale: LocalePreference,
    pub overlay: OverlaySettings,
    pub audio: AudioSettings,
    /// Fechar a janela só a esconde: o app segue na bandeja do sistema, com as
    /// teclas ativas. Só vale se a bandeja existe (ver `platform::tray`).
    #[serde(default = "yes")]
    pub close_to_tray: bool,
    /// Abrir o MoonDeck junto com a sessão do usuário.
    #[serde(default)]
    pub start_on_boot: bool,
    /// Ao abrir com o sistema, ficar só na bandeja, sem a janela.
    #[serde(default = "yes")]
    pub start_minimized: bool,
    /// Temas do overlay guardados pelo usuário.
    #[serde(default)]
    pub saved_themes: Vec<SavedTheme>,
    /// O tutorial de primeira abertura já foi visto (ou dispensado).
    #[serde(default)]
    pub onboarding_done: bool,
}

fn yes() -> bool {
    true
}

impl Default for General {
    fn default() -> Self {
        Self {
            mode_key: "Home".to_string(),
            capture_enabled: true,
            theme: ThemePreference::System,
            locale: LocalePreference::System,
            overlay: OverlaySettings::default(),
            audio: AudioSettings::default(),
            close_to_tray: true,
            start_on_boot: false,
            start_minimized: true,
            saved_themes: Vec::new(),
            onboarding_done: false,
        }
    }
}

// ---------------------------------------------------------------------- config

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub schema_version: u32,
    pub general: General,
    /// Ordem dos modos = ordem de ciclo da tecla de modo.
    pub modes: Vec<Mode>,
    pub active_mode: String,
}

impl Default for Config {
    fn default() -> Self {
        seed(SeedLocale::from_env())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeedLocale {
    PtBr,
    En,
}

impl SeedLocale {
    pub fn from_env() -> Self {
        let lang = std::env::var("LC_ALL")
            .or_else(|_| std::env::var("LC_MESSAGES"))
            .or_else(|_| std::env::var("LANG"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if lang.starts_with("pt") {
            Self::PtBr
        } else {
            Self::En
        }
    }
}

/// Primeira execução: um modo com atalhos que existem de verdade, e duas
/// camadas vazias prontas para receber som e apps. Nada de arquivo que não
/// está no disco.
pub fn seed(locale: SeedLocale) -> Config {
    let (shortcuts, soundboard, apps, copy, paste, undo) = match locale {
        SeedLocale::PtBr => ("Atalhos", "Soundboard", "Apps", "Copiar", "Colar", "Desfazer"),
        SeedLocale::En => ("Shortcuts", "Soundboard", "Apps", "Copy", "Paste", "Undo"),
    };

    Config {
        schema_version: SCHEMA_VERSION,
        general: General::default(),
        active_mode: "mode-shortcuts".to_string(),
        modes: vec![
            Mode {
                id: "mode-shortcuts".to_string(),
                name: shortcuts.to_string(),
                color: ModeColor::Sky,
                layout: LayoutPreset::Row,
                columns: 0,
                actions: vec![
                    Action {
                        id: "action-copy".to_string(),
                        label: copy.to_string(),
                        key: "Page_Up".to_string(),
                        span: Span::default(),
                        icon: None,
                        payload: ActionPayload::Shortcut {
                            combo: "ctrl+c".to_string(),
                        },
                    },
                    Action {
                        id: "action-paste".to_string(),
                        label: paste.to_string(),
                        key: "Page_Down".to_string(),
                        span: Span::default(),
                        icon: None,
                        payload: ActionPayload::Shortcut {
                            combo: "ctrl+v".to_string(),
                        },
                    },
                    Action {
                        id: "action-undo".to_string(),
                        label: undo.to_string(),
                        key: "End".to_string(),
                        span: Span::default(),
                        icon: None,
                        payload: ActionPayload::Shortcut {
                            combo: "ctrl+z".to_string(),
                        },
                    },
                ],
            },
            Mode {
                id: "mode-soundboard".to_string(),
                name: soundboard.to_string(),
                color: ModeColor::Sage,
                layout: LayoutPreset::Grid,
                columns: 0,
                actions: Vec::new(),
            },
            Mode {
                id: "mode-apps".to_string(),
                name: apps.to_string(),
                color: ModeColor::Slate,
                layout: LayoutPreset::Column,
                columns: 0,
                actions: Vec::new(),
            },
        ],
    }
}

// -------------------------------------------------------------------- validação

impl Config {
    pub fn mode(&self, id: &str) -> Option<&Mode> {
        self.modes.iter().find(|mode| mode.id == id)
    }

    /// Garante que o arquivo salvo nunca entre em estado impossível.
    pub fn validate(&self) -> Result<(), DeckError> {
        if self.modes.is_empty() {
            return Err(DeckError::new("config.noModes"));
        }
        if self.modes.len() > MAX_MODES {
            return Err(DeckError::with_detail(
                "mode.limitReached",
                format!("{} modos; máximo {MAX_MODES}", self.modes.len()),
            ));
        }
        if self.schema_version != SCHEMA_VERSION {
            return Err(DeckError::with_detail(
                "config.schemaNewer",
                format!(
                    "schema {} na memória, app escreve {SCHEMA_VERSION}",
                    self.schema_version
                ),
            ));
        }
        if self.mode(&self.active_mode).is_none() {
            return Err(DeckError::with_detail(
                "config.activeModeMissing",
                self.active_mode.clone(),
            ));
        }

        let mut seen_ids: Vec<&str> = Vec::with_capacity(self.modes.len());
        let mut seen_names: Vec<String> = Vec::with_capacity(self.modes.len());

        for mode in &self.modes {
            if mode.id.trim().is_empty() {
                return Err(DeckError::new("mode.idEmpty"));
            }
            if seen_ids.contains(&mode.id.as_str()) {
                return Err(DeckError::with_detail("mode.idDuplicate", mode.id.clone()));
            }
            seen_ids.push(&mode.id);

            let name = mode.name.trim();
            if name.is_empty() {
                return Err(DeckError::with_detail("mode.nameEmpty", mode.id.clone()));
            }
            if name.chars().count() > MAX_MODE_NAME {
                return Err(DeckError::with_detail(
                    "mode.nameTooLong",
                    format!("{name} ({} caracteres)", name.chars().count()),
                ));
            }
            let normalized = name.to_lowercase();
            if seen_names.contains(&normalized) {
                return Err(DeckError::with_detail("mode.duplicateName", name));
            }
            seen_names.push(normalized);

            if mode.actions.len() > MAX_ACTIONS {
                return Err(DeckError::with_detail(
                    "action.limitReached",
                    format!("{} ações em {name}; máximo {MAX_ACTIONS}", mode.actions.len()),
                ));
            }

            let mut seen_keys: Vec<&str> = Vec::with_capacity(mode.actions.len());
            for action in &mode.actions {
                if normalize_key(&action.key).as_deref() != Ok(action.key.as_str()) {
                    return Err(DeckError::with_detail("action.keyInvalid", action.key.clone()));
                }
                if same_key(&action.key, &self.general.mode_key) {
                    return Err(DeckError::with_detail(
                        "general.modeKeyInActionKeys",
                        action.key.clone(),
                    ));
                }
                if seen_keys.iter().any(|seen| same_key(seen, &action.key)) {
                    return Err(DeckError::with_detail(
                        "action.keyDuplicate",
                        action.key.clone(),
                    ));
                }
                seen_keys.push(&action.key);

                if action.label.trim().is_empty() {
                    return Err(DeckError::with_detail("action.labelEmpty", mode.name.clone()));
                }
                if action.label.chars().count() > MAX_ACTION_LABEL {
                    return Err(DeckError::with_detail(
                        "action.labelTooLong",
                        action.label.clone(),
                    ));
                }
                if action.span.cols == 0
                    || action.span.rows == 0
                    || action.span.cols > 2
                    || action.span.rows > 2
                {
                    return Err(DeckError::with_detail("action.spanInvalid", action.label.clone()));
                }

                match &action.payload {
                    ActionPayload::Sound {
                        file,
                        volume,
                        start_ms,
                        end_ms,
                        ..
                    } => {
                        if file.trim().is_empty() {
                            return Err(DeckError::with_detail(
                                "action.fileMissing",
                                action.label.clone(),
                            ));
                        }
                        if *volume > 200 {
                            return Err(DeckError::with_detail(
                                "action.volumeOutOfRange",
                                format!("{volume}"),
                            ));
                        }
                        if *end_ms != 0 && end_ms <= start_ms {
                            return Err(DeckError::with_detail(
                                "action.trimInvalid",
                                action.label.clone(),
                            ));
                        }
                    }
                    ActionPayload::Shortcut { combo } => {
                        parse_combo(combo).map_err(|reason| {
                            DeckError::with_detail(
                                "action.comboInvalid",
                                format!("{}: {reason}", action.label),
                            )
                        })?;
                    }
                    ActionPayload::Voice { .. } => {}
                    ActionPayload::Macro { steps } => {
                        if steps.is_empty() || steps.len() > MAX_MACRO_STEPS {
                            return Err(DeckError::with_detail(
                                "action.macroSteps",
                                action.label.clone(),
                            ));
                        }
                        for step in steps {
                            let bad = match step {
                                MacroStep::Shortcut { combo } => parse_combo(combo).is_err(),
                                MacroStep::Wait { ms } => *ms > MAX_MACRO_WAIT_MS,
                                MacroStep::Sound { file } => file.trim().is_empty(),
                            };
                            if bad {
                                return Err(DeckError::with_detail(
                                    "action.macroStepInvalid",
                                    action.label.clone(),
                                ));
                            }
                        }
                    }
                    ActionPayload::App { command, args } => {
                        let bad_text = |text: &str| text.len() > MAX_ICON_LEN || text.contains('\0');
                        if bad_text(command) || args.len() > MAX_APP_ARGS || args.iter().any(|arg| bad_text(arg)) {
                            return Err(DeckError::with_detail(
                                "action.commandInvalid",
                                action.label.clone(),
                            ));
                        }
                        if command.trim().is_empty() {
                            return Err(DeckError::with_detail(
                                "action.commandEmpty",
                                action.label.clone(),
                            ));
                        }
                    }
                }
            }
        }

        if normalize_key(&self.general.mode_key).as_deref() != Ok(self.general.mode_key.as_str()) {
            return Err(DeckError::with_detail(
                "general.modeKeyInvalid",
                self.general.mode_key.clone(),
            ));
        }
        if self.general.overlay.margin > MAX_OVERLAY_MARGIN {
            return Err(DeckError::with_detail(
                "general.overlayMarginOutOfRange",
                format!("{} px", self.general.overlay.margin),
            ));
        }
        if self.general.overlay.hide_after_ms > MAX_HIDE_AFTER_MS {
            return Err(DeckError::with_detail(
                "general.overlayDurationOutOfRange",
                format!("{} ms", self.general.overlay.hide_after_ms),
            ));
        }
        let look = &self.general.overlay;
        check_custom_css(&look.custom_css)?;
        if self.general.saved_themes.len() > MAX_SAVED_THEMES {
            return Err(DeckError::with_detail(
                "theme.limitReached",
                format!("{MAX_SAVED_THEMES} temas"),
            ));
        }
        for theme in &self.general.saved_themes {
            check_custom_css(&theme.look.custom_css)?;
            for color in theme.look.keys.colors().into_iter().flatten() {
                if !is_hex_color(color) {
                    return Err(DeckError::with_detail("general.overlayColorInvalid", color.clone()));
                }
            }
            if theme.name.trim().is_empty() || theme.name.chars().count() > MAX_THEME_NAME {
                return Err(DeckError::with_detail("theme.nameInvalid", theme.name.clone()));
            }
        }
        for mode in &self.modes {
            if mode.columns > MAX_GRID_COLUMNS {
                return Err(DeckError::with_detail(
                    "mode.columnsOutOfRange",
                    format!("{} colunas", mode.columns),
                ));
            }
            for action in &mode.actions {
                if action.icon.as_ref().is_some_and(|icon| icon.len() > MAX_ICON_LEN) {
                    return Err(DeckError::with_detail("action.iconInvalid", action.label.clone()));
                }
            }
        }
        for color in [&look.background, &look.accent]
            .into_iter()
            .chain(look.keys.colors())
            .flatten()
        {
            if !is_hex_color(color) {
                return Err(DeckError::with_detail(
                    "general.overlayColorInvalid",
                    color.clone(),
                ));
            }
        }
        if look.image_dim > MAX_IMAGE_DIM
            || look.opacity < MIN_OVERLAY_OPACITY
            || look.opacity > 100
            || look.scale < MIN_OVERLAY_SCALE
            || look.scale > MAX_OVERLAY_SCALE
        {
            return Err(DeckError::with_detail(
                "general.overlayLookOutOfRange",
                format!("{}/{}/{}", look.image_dim, look.opacity, look.scale),
            ));
        }
        if self.general.audio.volume > 100 {
            return Err(DeckError::with_detail(
                "general.volumeOutOfRange",
                format!("{}", self.general.audio.volume),
            ));
        }

        Ok(())
    }
}

/// Ids precisam ser únicos entre execuções, não globalmente únicos. Tempo em
/// nanossegundos + contador resolve sem puxar um gerador de UUID.
pub fn new_id(prefix: &str) -> String {
    use std::sync::atomic::{AtomicU32, Ordering};
    static COUNTER: AtomicU32 = AtomicU32::new(0);

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or_default();
    let salt = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{nanos:x}{salt:x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pt() -> Config {
        seed(SeedLocale::PtBr)
    }

    #[test]
    fn macro_precisa_de_passos_validos() {
        let mut config = pt();
        let action = &mut config.modes[0].actions[0];
        action.payload = ActionPayload::Macro { steps: vec![] };
        assert!(config.validate().is_err());

        let action = &mut config.modes[0].actions[0];
        action.payload = ActionPayload::Macro {
            steps: vec![
                MacroStep::Shortcut { combo: "ctrl+c".to_string() },
                MacroStep::Wait { ms: 200 },
            ],
        };
        assert!(config.validate().is_ok());

        let action = &mut config.modes[0].actions[0];
        action.payload = ActionPayload::Macro { steps: vec![MacroStep::Wait { ms: 999_999 }] };
        assert!(config.validate().is_err());
    }

    #[test]
    fn semente_e_valida() {
        assert!(pt().validate().is_ok());
        assert!(seed(SeedLocale::En).validate().is_ok());
    }

    #[test]
    fn nome_vazio_e_recusado() {
        let mut config = pt();
        config.modes[1].name = "   ".to_string();
        let error = config.validate().expect_err("deveria falhar");
        assert_eq!(error.code, "mode.nameEmpty");
    }

    #[test]
    fn nomes_repetidos_sao_recusados_ignorando_caixa() {
        let mut config = pt();
        config.modes[1].name = config.modes[0].name.to_uppercase();
        let error = config.validate().expect_err("deveria falhar");
        assert_eq!(error.code, "mode.duplicateName");
    }

    #[test]
    fn tecla_repetida_no_mesmo_modo_e_recusada() {
        let mut config = pt();
        config.modes[0].actions[1].key = config.modes[0].actions[0].key.clone();
        let error = config.validate().expect_err("deveria falhar");
        assert_eq!(error.code, "action.keyDuplicate");
    }

    #[test]
    fn teclas_livres_sao_normalizadas() {
        // Os modificadores são canônicos; o nome da tecla fica como veio.
        assert_eq!(normalize_key("ctrl+Home").as_deref(), Ok("CTRL+Home"));
        assert_eq!(normalize_key("Home + Super + Shift").as_deref(), Ok("SHIFT+LOGO+Home"));
        assert_eq!(normalize_key(" F13 ").as_deref(), Ok("F13"));
        assert_eq!(normalize_key("XF86Launch5").as_deref(), Ok("XF86Launch5"));
        assert!(normalize_key("").is_err());
        assert!(normalize_key("ctrl+").is_err());
        assert!(normalize_key("ctrl+alt").is_err());
        assert!(normalize_key("a+b").is_err());
        assert!(normalize_key("tecla com espaço").is_err());
    }

    #[test]
    fn tecla_de_modo_nao_pode_ser_de_acao() {
        let mut config = pt();
        // A comparação ignora caixa: "home" colide com "Home".
        config.modes[0].actions[0].key = "home".to_string();
        let error = config.validate().expect_err("deveria falhar");
        assert_eq!(error.code, "general.modeKeyInActionKeys");
    }

    #[test]
    fn atalho_invalido_e_recusado() {
        let mut config = pt();
        config.modes[0].actions[0].payload = ActionPayload::Shortcut {
            combo: "ctrl+tecla-que-nao-existe".to_string(),
        };
        let error = config.validate().expect_err("deveria falhar");
        assert_eq!(error.code, "action.comboInvalid");
    }

    #[test]
    fn modo_ativo_precisa_existir() {
        let mut config = pt();
        config.active_mode = "mode-fantasma".to_string();
        let error = config.validate().expect_err("deveria falhar");
        assert_eq!(error.code, "config.activeModeMissing");
    }

    #[test]
    fn ids_gerados_nao_colidem() {
        let ids: Vec<String> = (0..64).map(|_| new_id("mode")).collect();
        let unique: std::collections::HashSet<&String> = ids.iter().collect();
        assert_eq!(unique.len(), ids.len());
    }
}

#[cfg(test)]
mod css_tests {
    use super::check_custom_css;

    #[test]
    fn css_local_passa_e_rede_nao() {
        assert!(check_custom_css(".hud-card { border-radius: 4px; animation: x 1s; }").is_ok());
        assert!(check_custom_css("@import url(x.css);").is_err());
        assert!(check_custom_css(".a{background:url( https://x.test/a.png )}").is_err());
        assert!(check_custom_css(".a{background:url(//x.test/a.png)}").is_err());
        assert!(check_custom_css(".a{background:image-set(\"https://x.test/a.png\" 1x)}").is_err());
        assert!(check_custom_css(".a{background:url(\"data:image/svg+xml,%3Csvg xmlns=%22http%3A%2F%2Fw%22%3E\") center}").is_ok());
        assert!(check_custom_css(".a{background:url(\"data:image/png;base64,AAAA\") x url(http://a)}").is_err());
        assert!(check_custom_css(&"a".repeat(20_001)).is_err());
    }
}
