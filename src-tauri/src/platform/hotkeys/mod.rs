//! Captura global de teclas. Cada sistema tem o seu caminho:
//!
//! - Linux: portal `GlobalShortcuts` (funciona no Wayland e no X11);
//! - Windows e macOS: atalhos globais do sistema, pelo plugin do Tauri.
//!
//! Os dois entregam o mesmo: um `BoundSession` aberto e, a cada tecla, uma
//! `Activation` (apertada ou solta).

use serde::Serialize;
use specta::Type;

#[cfg(target_os = "linux")]
mod portal;
#[cfg(target_os = "linux")]
pub use portal::{bind_with, BoundSession};

#[cfg(not(target_os = "linux"))]
mod native;
#[cfg(not(target_os = "linux"))]
pub use native::{bind_with, BoundSession};

/// Identidade do app perante o sistema. Tem de bater com o `identifier` do
/// `tauri.conf.json` (e, no Linux, com o nome do arquivo `.desktop`).
#[cfg(target_os = "linux")]
pub const APP_ID: &str = "dev.moondeck.app";

#[derive(Debug, Clone)]
pub struct HotkeyRequest {
    pub id: String,
    pub description: String,
    pub trigger: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    pub id: String,
    pub description: String,
    pub trigger: String,
}

#[derive(Debug, Clone)]
pub struct BindResult {
    pub bindings: Vec<Binding>,
}

/// Uma tecla do deck: `pressed = false` quando foi solta.
#[derive(Debug, Clone)]
pub struct Activation {
    pub id: String,
    pub pressed: bool,
}
