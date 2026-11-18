//! Um único ponto que declara os comandos e gera o TypeScript.
//!
//! O contrato mora no Rust: se um campo mudar de nome ou de tipo, o build do
//! front quebra na hora. O arquivo gerado (`src/lib/bindings.ts`) é commitado
//! para que `pnpm typecheck` funcione sem abrir o app; o teste
//! `bindings_ficam_em_dia` regenera e falha se algo ficou para trás.

use tauri_specta::{collect_commands, Builder};

pub const BINDINGS_PATH: &str = "../src/lib/bindings.ts";

pub fn build() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            // plataforma
            crate::platform::overlay_preview,
            crate::platform::overlay_ready,
            crate::platform::overlay_fit,
            crate::platform::app_open_main,
            crate::platform::app_quit,
            crate::platform::app_tray_available,
            crate::platform::sound_peaks,
            crate::platform::sound_preview,
            crate::platform::sound_stop,
            crate::platform::overlay_image,
            crate::platform::app_icon,
            crate::platform::apps_list,
            crate::platform::platform_caps,
            crate::platform::input_devices,
            crate::platform::audio_devices,
            crate::platform::audio_test,
            crate::platform::tray::tray_language,
            crate::platform::mic::mic_status,
            // motor
            crate::engine::engine_status,
            crate::engine::engine_retry,
            crate::engine::engine_hold,
            crate::engine::engine_toggle_paused,
            // deck
            crate::deck::deck_snapshot,
            crate::deck::deck_cycle_mode,
            crate::deck::deck_activate_mode,
            crate::deck::deck_create_mode,
            crate::deck::deck_update_mode,
            crate::deck::deck_delete_mode,
            crate::deck::deck_save_general,
            crate::deck::deck_save_action,
            crate::deck::deck_delete_action,
            crate::deck::deck_reorder_actions,
            crate::deck::deck_reorder_modes,
            crate::deck::deck_export,
            crate::deck::theme_export,
            crate::deck::theme_import,
            crate::deck::theme_save,
            crate::deck::theme_delete,
            crate::deck::deck_import,
        ])

}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bindings_ficam_em_dia() {
        build()
            .export(specta_typescript::Typescript::default(), BINDINGS_PATH)
            .expect("exportar bindings TypeScript");
    }
}
