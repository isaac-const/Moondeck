//! Ícone na bandeja do sistema (StatusNotifierItem no KDE).
//!
//! É o que permite "fechar" a janela sem encerrar o deck: as teclas continuam
//! ativas e o menu da bandeja abre a janela, liga/desliga a captura ou sai de
//! verdade. No Linux o clique esquerdo costuma abrir o menu em vez de gerar
//! evento, então todo o necessário está no menu.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

use crate::config::model::{General, LocalePreference};

const ICON: &[u8] = include_bytes!("../../icons/128x128.png");
const MENU_OPEN: &str = "open";
const MENU_CAPTURE: &str = "capture";
const MENU_QUIT: &str = "quit";

struct Labels {
    open: &'static str,
    capture: &'static str,
    quit: &'static str,
    tooltip: &'static str,
}

const PT: Labels = Labels {
    open: "Abrir o MoonDeck",
    capture: "Capturar as teclas",
    quit: "Sair",
    tooltip: "MoonDeck",
};
const EN: Labels = Labels {
    open: "Open MoonDeck",
    capture: "Capture keys",
    quit: "Quit",
    tooltip: "MoonDeck",
};

struct Items {
    open: MenuItem<Wry>,
    capture: CheckMenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[derive(Default)]
pub struct TrayState {
    available: AtomicBool,
    /// `true` = português. Vem da interface (`tray_language`), que é quem sabe
    /// o idioma escolhido; antes disso, da config e do ambiente.
    portuguese: Mutex<Option<bool>>,
    items: Mutex<Option<Items>>,
}

impl TrayState {
    fn labels(&self, general: &General) -> &'static Labels {
        let portuguese = self
            .portuguese
            .lock()
            .ok()
            .and_then(|guard| *guard)
            .unwrap_or(match general.locale {
                LocalePreference::PtBr => true,
                LocalePreference::En => false,
                LocalePreference::System => {
                    crate::config::model::SeedLocale::from_env()
                        == crate::config::model::SeedLocale::PtBr
                }
            });
        if portuguese { &PT } else { &EN }
    }
}

/// Só vale esconder a janela ao fechar se existe um ícone para trazê-la de
/// volta. Sem bandeja (GNOME puro, sem extensão) fechar encerra o app.
pub fn is_available(app: &AppHandle) -> bool {
    app.state::<TrayState>().available.load(Ordering::Acquire)
}

pub fn setup(app: &AppHandle, general: &General) {
    // O ícone depende da libayatana-appindicator (ou libappindicator), que o
    // Tauri carrega em runtime e **entra em pânico** se não a encontra. Sem a
    // biblioteca o app segue sem bandeja — e fechar a janela passa a encerrar.
    let outcome: Result<(), String> =
        match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| build(app, general))) {
            Ok(result) => result.map_err(|error| error.to_string()),
            Err(_) => Err("biblioteca de bandeja ausente (instale libayatana-appindicator)".to_string()),
        };
    match outcome {
        Ok(()) => {
            app.state::<TrayState>()
                .available
                .store(true, Ordering::Release);
            log::info!("ícone da bandeja criado");
        }
        Err(error) => log::warn!("sem ícone na bandeja: {error}"),
    }
}

fn build(app: &AppHandle, general: &General) -> tauri::Result<()> {
    let state = app.state::<TrayState>();
    let labels = state.labels(general);

    let open = MenuItem::with_id(app, MENU_OPEN, labels.open, true, None::<&str>)?;
    let capture = CheckMenuItem::with_id(
        app,
        MENU_CAPTURE,
        labels.capture,
        true,
        general.capture_enabled,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, MENU_QUIT, labels.quit, true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &capture, &separator, &quit])?;

    TrayIconBuilder::with_id("moondeck")
        .icon(Image::from_bytes(ICON)?)
        .tooltip(labels.tooltip)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_OPEN => {
                if let Err(error) = super::overlay::open_main(app, None) {
                    log::warn!("{error}");
                }
            }
            MENU_CAPTURE => {
                let enabled = !app
                    .state::<crate::deck::DeckState>()
                    .config()
                    .general
                    .capture_enabled;
                crate::deck::set_capture_enabled(app, enabled);
            }
            MENU_QUIT => crate::engine::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let _ = super::overlay::open_main(tray.app_handle(), None);
            }
        })
        .build(app)?;

    if let Ok(mut items) = state.items.lock() {
        *items = Some(Items {
            open,
            capture,
            quit,
        });
    }
    Ok(())
}

/// Mantém o menu em dia com a config (check da captura) e com o idioma.
pub fn refresh(app: &AppHandle, general: &General) {
    let state = app.state::<TrayState>();
    let labels = state.labels(general);
    let Ok(items) = state.items.lock() else {
        return;
    };
    let Some(items) = items.as_ref() else {
        return;
    };
    let _ = items.capture.set_checked(general.capture_enabled);
    let _ = items.open.set_text(labels.open);
    let _ = items.capture.set_text(labels.capture);
    let _ = items.quit.set_text(labels.quit);
}

/// A interface avisa o idioma ativo (`pt-BR` ou `en`) para o menu acompanhar.
#[tauri::command]
#[specta::specta]
pub fn tray_language(app: AppHandle, language: String) {
    if let Ok(mut portuguese) = app.state::<TrayState>().portuguese.lock() {
        *portuguese = Some(language.to_ascii_lowercase().starts_with("pt"));
    }
    let general = app.state::<crate::deck::DeckState>().config().general;
    refresh(&app, &general);
}
