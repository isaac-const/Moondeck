//! Motor do deck: liga as teclas da config ao portal de atalhos globais e
//! transforma cada ativação em ação.
//!
//! - a tecla de modo mostra o modo ativo; apertada de novo logo em seguida
//!   (enquanto o HUD ainda está na tela), troca de camada;
//! - uma tecla de ação executa o que estiver mapeado **no modo ativo**;
//! - o conjunto de teclas é a união da tecla de modo com todas as teclas de
//!   todas as ações, então trocar de modo não exige novo registro no portal;
//! - quando esse conjunto muda, o registro é refeito. No KDE isso pode pedir
//!   aprovação de novo — por isso só acontece quando as teclas mudam de fato.
//!
//! Enquanto a captura está ligada o compositor entrega essas teclas só ao
//! MoonDeck: `Home` deixa de funcionar nos outros apps. É o comportamento de um
//! deck e é por isso que existe `capture_enabled` e a pausa durante a gravação
//! de uma tecla nova.

pub mod actions;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::{
    collections::HashSet,
    sync::Mutex,
    time::{Duration, Instant},
};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::config::model::{same_key, Action, Config};
use crate::deck::{self, DeckState};
use crate::platform::hotkeys::{self, Activation, Binding, BoundSession, HotkeyRequest};
use crate::platform::overlay;

pub const STATUS_EVENT: &str = "engine://status";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum EnginePhase {
    /// Captura desligada (config) ou suspensa (gravando tecla).
    Off,
    /// Esperando o portal — o diálogo do sistema pode estar aberto.
    Binding,
    Active,
    Error,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub phase: EnginePhase,
    pub keys: Vec<String>,
    /// O que o portal realmente aceitou (pode diferir do pedido).
    pub bindings: Vec<Binding>,
    pub error: Option<String>,
    /// Quem está segurando a captura: `capture`.
    pub holds: Vec<String>,
    /// Modo Off: só a tecla de modo segue valendo; as outras voltam ao normal.
    pub paused: bool,
}

struct Inner {
    listener: Option<BoundSession>,
    keys: Vec<String>,
    holds: HashSet<String>,
    phase: EnginePhase,
    bindings: Vec<Binding>,
    error: Option<String>,
    paused: bool,
}

pub struct EngineState {
    inner: Mutex<Inner>,
    /// Serializa as sincronizações com o portal (ver `sync`).
    turn: futures::lock::Mutex<()>,
    /// Último toque na tecla de modo, para reconhecer o toque duplo.
    last_mode_tap: Mutex<Option<Instant>>,
    /// Cada aperto da tecla de modo ganha um número; quem segura confere se
    /// ainda é o mesmo aperto antes de ligar o modo Off.
    mode_press: AtomicU64,
    mode_down: AtomicBool,
    /// Só vale segurar para pausar depois que o portal provou que avisa quando
    /// a tecla é solta; sem isso, todo toque viraria "segurar".
    releases_seen: AtomicBool,
}

impl Default for EngineState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                listener: None,
                keys: Vec::new(),
                holds: HashSet::new(),
                phase: EnginePhase::Off,
                bindings: Vec::new(),
                error: None,
                paused: false,
            }),
            turn: futures::lock::Mutex::new(()),
            last_mode_tap: Mutex::new(None),
            mode_press: AtomicU64::new(0),
            mode_down: AtomicBool::new(false),
            releases_seen: AtomicBool::new(false),
        }
    }
}

impl Inner {
    fn status(&self) -> EngineStatus {
        let mut holds: Vec<String> = self.holds.iter().cloned().collect();
        holds.sort();
        EngineStatus {
            phase: self.phase,
            keys: self.keys.clone(),
            bindings: self.bindings.clone(),
            error: self.error.clone(),
            holds,
            paused: self.paused,
        }
    }
}

fn publish(app: &AppHandle, status: EngineStatus) {
    if let Err(error) = app.emit(STATUS_EVENT, status) {
        log::warn!("falha ao emitir {STATUS_EVENT}: {error}");
    }
}

/// Teclas pedidas ao portal, na ordem: modo primeiro, depois as ações.
///
/// Só as teclas do modo ativo são tomadas do sistema: as demais seguem
/// fazendo o que sempre fizeram. No modo Off, só a tecla de modo.
fn plan(config: &Config, paused: bool) -> Vec<HotkeyRequest> {
    let mut requests: Vec<HotkeyRequest> = vec![HotkeyRequest {
        id: config.general.mode_key.clone(),
        description: "MoonDeck: trocar de modo".to_string(),
        trigger: config.general.mode_key.clone(),
    }];
    let active = config.mode(&config.active_mode).into_iter().filter(|_| !paused);
    for mode in active {
        for action in &mode.actions {
            if requests.iter().any(|r| same_key(&r.id, &action.key)) {
                continue;
            }
            requests.push(HotkeyRequest {
                id: action.key.clone(),
                description: format!("MoonDeck: {}", action.label),
                trigger: action.key.clone(),
            });
        }
    }
    requests
}

/// Reconcilia o portal com a config. Barato quando nada mudou.
pub fn request_sync(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { sync(app).await });
}

/// Reconcilia o portal com a config e só volta quando terminou — inclusive
/// fechar a sessão antiga. A gravação de tecla depende disso.
pub async fn sync(app: AppHandle) {
    let engine = app.state::<EngineState>();
    // Uma sincronização por vez: fechar a sessão antiga, abrir a nova e só
    // então liberar a próxima. Sem isso, duas sessões brigariam pela mesma
    // tecla e `engine_hold` voltaria antes de o portal soltá-la.
    let _turn = engine.turn.lock().await;

    let deck_state = app.state::<DeckState>();
    let config = deck_state.config();

    // Decodifica os sons da config já: a primeira tecla não espera o mp3.
    crate::platform::sound::prewarm(
        config
            .modes
            .iter()
            .flat_map(|mode| &mode.actions)
            .filter_map(|action| match &action.payload {
                crate::config::model::ActionPayload::Sound { file, .. } => {
                    Some(std::path::PathBuf::from(file))
                }
                _ => None,
            })
            .collect(),
    );

    // Saída acordada e microfone virtual seguem a config. Fala com pactl e
    // abre processos, então fica fora do executor.
    {
        let audio = config.general.audio.clone();
        let has_sound = config.modes.iter().flat_map(|mode| &mode.actions).any(|action| {
            matches!(action.payload, crate::config::model::ActionPayload::Sound { .. })
        });
        let app = app.clone();
        tauri::async_runtime::spawn_blocking(move || {
            crate::platform::sound::keep_awake(
                audio.keep_awake && (has_sound || audio.mic_routing),
                audio.sink.as_deref(),
            );
            crate::platform::mic::apply(&app, &audio);
        });
    }

    // (teclas a registrar, sessão antiga a fechar) — nunca segura o lock de
    // dados atravessando um `await`.
    let plan_step = {
        let Ok(mut inner) = engine.inner.lock() else {
            return;
        };
        let wanted = if config.general.capture_enabled && inner.holds.is_empty() {
            plan(&config, inner.paused)
        } else {
            Vec::new()
        };
        let wanted_keys: Vec<String> = wanted.iter().map(|r| r.id.clone()).collect();

        let unchanged = wanted_keys == inner.keys
            && (wanted_keys.is_empty()
                || matches!(inner.phase, EnginePhase::Active | EnginePhase::Error));
        if unchanged {
            // Mesmo conjunto: só republica os `holds`, que a UI exibe.
            let status = inner.status();
            drop(inner);
            publish(&app, status);
            return;
        }

        let retired = inner.listener.take();
        inner.keys = wanted_keys;
        inner.bindings.clear();
        inner.error = None;
        inner.phase = if wanted.is_empty() {
            EnginePhase::Off
        } else {
            EnginePhase::Binding
        };
        let status = inner.status();
        drop(inner);
        publish(&app, status);
        (wanted, retired)
    };
    let (requests, retired) = plan_step;

    if let Some(previous) = retired {
        previous.close().await;
    }
    if requests.is_empty() {
        return;
    }

    let handler_app = app.clone();
    let outcome = hotkeys::bind_with(&app, requests, move |activation| {
        handle_activation(&handler_app, activation);
    })
    .await;

    let status = {
        let Ok(mut inner) = engine.inner.lock() else {
            return;
        };
        match outcome {
            Ok((result, session)) => {
                log::info!(
                    "captura ativa: {}",
                    result
                        .bindings
                        .iter()
                        .map(|b| format!("{}→{}", b.id, b.trigger))
                        .collect::<Vec<_>>()
                        .join(", ")
                );
                // O KDE pode devolver a tecla sem gatilho (guardou outro, ou
                // o usuário a removeu nos Atalhos do sistema). Avisa em vez de
                // fingir que está ativa.
                let missing: Vec<&str> = inner
                    .keys
                    .iter()
                    .filter(|key| {
                        !result
                            .bindings
                            .iter()
                            .any(|b| b.id == **key && !b.trigger.trim().is_empty())
                    })
                    .map(String::as_str)
                    .collect();
                if !missing.is_empty() {
                    inner.error = Some(format!(
                        "o sistema não ativou: {}",
                        missing.join(", ")
                    ));
                }
                inner.listener = Some(session);
                inner.bindings = result.bindings;
                inner.phase = EnginePhase::Active;
            }
            Err(error) => {
                log::warn!("captura de teclas indisponível: {error}");
                inner.phase = EnginePhase::Error;
                inner.error = Some(error);
            }
        }
        inner.status()
    };
    publish(&app, status);
}

/// Uma tecla do portal virou ação.
fn handle_activation(app: &AppHandle, activation: Activation) {
    let deck_state = app.state::<DeckState>();
    let config = deck_state.config();
    let key = activation.id;

    if !activation.pressed {
        let engine = app.state::<EngineState>();
        engine.releases_seen.store(true, Ordering::Relaxed);
        if same_key(&key, &config.general.mode_key) {
            engine.mode_down.store(false, Ordering::Relaxed);
        }
        // Tecla solta: só interessa ao push-to-talk de voz.
        let active = config.mode(&config.active_mode).and_then(|mode| {
            mode.actions.iter().find(|a| same_key(&a.key, &key))
        });
        if let Some(Action { payload: crate::config::model::ActionPayload::Voice { effect, hold: true }, .. }) = active {
            if crate::platform::mic::voice() == Some(*effect) {
                let (app, audio) = (app.clone(), config.general.audio.clone());
                std::thread::spawn(move || crate::platform::mic::set_voice(&app, None, &audio));
            }
        }
        return;
    }

    if same_key(&key, &config.general.mode_key) {
        watch_hold(app);
        on_mode_key(app, &deck_state, &config);
        return;
    }

    let Some(mode) = config.mode(&config.active_mode) else {
        return;
    };
    let Some(action) = mode.actions.iter().find(|a| same_key(&a.key, &key)) else {
        // A tecla pertence a outro modo. Mostrar a camada ajuda o usuário a
        // ver por que nada aconteceu.
        if config.general.overlay.enabled {
            overlay::fire_hud(app, None);
        }
        return;
    };

    actions::run(app, action, &config.general.audio);
    if config.general.overlay.enabled {
        overlay::fire_hud(app, Some(action.key.clone()));
    }
}

/// Quanto a tecla de modo precisa ficar apertada para ligar/desligar o Off.
const HOLD_MS: u64 = 5_000;

/// Segurar a tecla de modo alterna o modo Off.
fn watch_hold(app: &AppHandle) {
    let engine = app.state::<EngineState>();
    if !engine.releases_seen.load(Ordering::Relaxed) {
        return;
    }
    let press = engine.mode_press.fetch_add(1, Ordering::SeqCst) + 1;
    engine.mode_down.store(true, Ordering::SeqCst);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(HOLD_MS));
        let engine = app.state::<EngineState>();
        if engine.mode_press.load(Ordering::SeqCst) == press
            && engine.mode_down.swap(false, Ordering::SeqCst)
        {
            toggle_paused(&app);
        }
    });
}

/// Liga/desliga o modo Off e mostra o resultado no overlay.
pub fn toggle_paused(app: &AppHandle) {
    let status = {
        let engine = app.state::<EngineState>();
        let Ok(mut inner) = engine.inner.lock() else {
            return;
        };
        inner.paused = !inner.paused;
        inner.status()
    };
    publish(app, status);
    request_sync(app);
    let config = app.state::<DeckState>().config();
    if config.general.overlay.enabled {
        overlay::fire_hud(app, Some(config.general.mode_key.clone()));
    }
}

/// Quanto tempo vale um segundo toque na tecla de modo: o mesmo que o HUD fica
/// na tela. Quem olha o modo e escolhe uma ação não troca de camada sem querer.
fn double_tap_window(config: &Config) -> Duration {
    match config.general.overlay.hide_after_ms {
        0 => Duration::from_millis(3_000),
        ms => Duration::from_millis(u64::from(ms)),
    }
}

/// Primeiro toque: só mostra o modo ativo. Toque seguido dentro da janela:
/// troca. Sem HUD não há o que "ver", então o toque troca direto.
fn on_mode_key(app: &AppHandle, deck_state: &State<'_, DeckState>, config: &Config) {
    let engine = app.state::<EngineState>();
    let now = Instant::now();
    let repeated = {
        let Ok(mut last) = engine.last_mode_tap.lock() else {
            return;
        };
        let repeated = last.is_some_and(|before| now.duration_since(before) <= double_tap_window(config));
        // Depois de um toque que trocou, o próximo também vale: dá para
        // percorrer vários modos apertando em sequência.
        *last = Some(now);
        repeated
    };

    let paused = engine.inner.lock().map(|inner| inner.paused).unwrap_or(false);
    if paused {
        overlay::fire_hud(app, Some(config.general.mode_key.clone()));
    } else if repeated || !config.general.overlay.enabled {
        if let Err(error) = deck::cycle(app, deck_state, 1) {
            log::warn!("não foi possível trocar de modo: {error}");
        }
    } else {
        overlay::fire_hud(app, Some(config.general.mode_key.clone()));
    }
}

/// Encerra de verdade: solta as teclas no portal antes de sair, para o
/// compositor não ficar com elas presas a um processo que já foi embora.
pub fn quit(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let retired = {
            let engine = app.state::<EngineState>();
            engine.inner.lock().ok().and_then(|mut inner| {
                inner.keys.clear();
                inner.listener.take()
            })
        };
        if let Some(session) = retired {
            session.close().await;
        }
        let _ = tauri::async_runtime::spawn_blocking(|| {
            crate::platform::sound::stop_all();
            crate::platform::sound::keep_awake(false, None);
            crate::platform::mic::shutdown();
        })
        .await;
        app.exit(0);
    });
}

fn update_hold(app: &AppHandle, who: &str, hold: bool) {
    let engine = app.state::<EngineState>();
    let Ok(mut inner) = engine.inner.lock() else {
        return;
    };
    if hold {
        inner.holds.insert(who.to_string());
    } else {
        inner.holds.remove(who);
    }
}

#[tauri::command]
#[specta::specta]
pub fn engine_status(state: State<'_, EngineState>) -> EngineStatus {
    match state.inner.lock() {
        Ok(inner) => inner.status(),
        Err(_) => EngineStatus {
            phase: EnginePhase::Error,
            keys: Vec::new(),
            bindings: Vec::new(),
            error: Some("estado do motor corrompido".to_string()),
            holds: Vec::new(),
            paused: false,
        },
    }
}

/// Tenta registrar de novo depois de um erro (portal indisponível, diálogo
/// recusado).
#[tauri::command]
#[specta::specta]
pub async fn engine_retry(app: AppHandle) {
    let retired = {
        let engine = app.state::<EngineState>();
        let Ok(mut inner) = engine.inner.lock() else {
            return;
        };
        inner.keys.clear();
        inner.phase = EnginePhase::Off;
        inner.error = None;
        inner.listener.take()
    };
    if let Some(previous) = retired {
        previous.close().await;
    }
    sync(app).await;
}

/// A tela de teclas segura a captura enquanto grava uma tecla nova: sem isso
/// o compositor engole a tecla e a janela nunca a vê.
#[tauri::command]
#[specta::specta]
pub async fn engine_hold(app: AppHandle, hold: bool) {
    update_hold(&app, "capture", hold);
    // Ao segurar, só responde depois que o portal soltou as teclas: é o que
    // garante que a próxima tecla apertada chega à janela.
    sync(app).await;
}

/// Liga/desliga o modo Off (a UI e a bandeja usam o mesmo caminho da tecla).
#[tauri::command]
#[specta::specta]
pub fn engine_toggle_paused(app: AppHandle) {
    toggle_paused(&app);
}
