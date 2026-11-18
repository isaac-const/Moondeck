//! Leitura do ambiente: diretório de runtime e tipo de sessão gráfica.

use std::env;
#[cfg(target_os = "linux")]
use std::path::PathBuf;

/// Diretório de runtime do usuário. Precisa existir e ser privado.
#[cfg(target_os = "linux")]
pub fn runtime_dir() -> PathBuf {
    env::var_os("XDG_RUNTIME_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
}

#[cfg(target_os = "linux")]
pub fn managed_ydotool_socket() -> PathBuf {
    runtime_dir().join("moondeck").join("ydotoold.sock")
}

pub fn is_wayland() -> bool {
    let session = env::var("XDG_SESSION_TYPE").unwrap_or_default();
    session.eq_ignore_ascii_case("wayland")
        || env::var_os("WAYLAND_DISPLAY").is_some_and(|value| !value.is_empty())
}
