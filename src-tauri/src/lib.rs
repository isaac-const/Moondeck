mod config;
mod deck;
mod engine;
mod error;
mod ipc;
mod keys;
mod platform;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta = ipc::build();

    #[cfg(debug_assertions)]
    if let Err(error) = specta.export(specta_typescript::Typescript::default(), ipc::BINDINGS_PATH) {
        eprintln!("não foi possível gerar os bindings TypeScript: {error}");
    }

    let builder = tauri::Builder::default();
    // Windows e macOS: teclas globais e início automático vêm de plugins.
    #[cfg(not(target_os = "linux"))]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![platform::autostart::HIDDEN_ARG]),
        ));

    builder
        // Segunda abertura (atalho do menu, autostart + clique): traz a janela
        // do app que já roda em vez de brigar com ele pelo portal e pela config.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Err(error) = platform::overlay::open_main(app, None) {
                log::warn!("{error}");
            }
        }))
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(deck::DeckState::bootstrap())
        .manage(engine::EngineState::default())
        .manage(platform::tray::TrayState::default())
        .invoke_handler(specta.invoke_handler())
        .on_window_event(|window, event| {
            // Fechar a janela principal: some na bandeja ou encerra, conforme a
            // preferência — e só some se a bandeja existe.
            if window.label() != "main" {
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let to_tray = app
                    .state::<deck::DeckState>()
                    .config()
                    .general
                    .close_to_tray
                    && platform::tray::is_available(app);
                api.prevent_close();
                if to_tray {
                    let _ = window.hide();
                } else {
                    engine::quit(app);
                }
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let general = app.state::<deck::DeckState>().config().general;
            platform::tray::setup(app.handle(), &general);
            // Mantém o arquivo de início automático apontando para este binário.
            if let Err(error) = platform::autostart::sync(app.handle(), &general) {
                log::warn!("início automático: {error}");
            }
            // Aberta pelo sistema (`--hidden`), a janela nem aparece — mas só
            // se há bandeja para trazê-la de volta.
            let stay_hidden = platform::autostart::started_hidden()
                && general.start_minimized
                && platform::tray::is_available(app.handle());
            if !stay_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                }
            }
            // Registra as teclas do deck no portal assim que a config carregou.
            engine::request_sync(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o MoonDeck");
}
