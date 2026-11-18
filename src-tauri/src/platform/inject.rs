//! Injeção de teclas no Linux (Wayland e X11).
//!
//! O `kdotool` controla janelas, mas não sintetiza teclas. O caminho que
//! funciona sem root nesta máquina é o `ydotool`: o `/dev/uinput` tem ACL para
//! o usuário, então o MoonDeck pode iniciar o próprio `ydotoold` e falar com
//! ele por um socket privado dentro de `$XDG_RUNTIME_DIR/moondeck`.

use std::{
    fs,
    os::unix::fs::PermissionsExt,
    os::unix::net::{UnixDatagram, UnixStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

use super::probe::managed_ydotool_socket;
use crate::keys::parse_combo;

/// O `ydotoold` 1.0 escuta num socket **datagram**: `UnixStream::connect`
/// falha nele sempre, e o app concluía que o daemon não existia, subia outro a
/// cada ação e desistia depois de 2 s sem enviar a tecla. Aceita os dois tipos
/// (versões novas usam stream).
fn socket_alive(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    let datagram = UnixDatagram::unbound()
        .and_then(|socket| socket.connect(path))
        .is_ok();
    datagram || UnixStream::connect(path).is_ok()
}

/// Sobe o daemon no socket privado do app. `setsid` desanexa do processo pai:
/// fechar o MoonDeck não deve derrubar o daemon no meio de uma ação.
fn ensure_daemon() -> Result<PathBuf, String> {
    // O socket fica no diretório de runtime do usuário (privado). Sem ele, o
    // caminho cairia num diretório compartilhado como /tmp.
    if std::env::var_os("XDG_RUNTIME_DIR").is_none_or(|dir| dir.is_empty()) {
        return Err("XDG_RUNTIME_DIR não está definido; não há onde criar o socket do ydotoold".to_string());
    }
    let socket = managed_ydotool_socket();

    if socket_alive(&socket) {
        return Ok(socket);
    }

    if !Path::new("/dev/uinput").exists() {
        return Err("/dev/uinput não existe nesta máquina".to_string());
    }
    if fs::OpenOptions::new().read(true).open("/dev/uinput").is_err() {
        return Err(
            "sem permissão de leitura em /dev/uinput (regra udev 80-uinput.rules não aplicada ao usuário)"
                .to_string(),
        );
    }

    if let Some(parent) = socket.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("não foi possível criar {}: {error}", parent.display()))?;
        let _ = fs::set_permissions(parent, fs::Permissions::from_mode(0o700));
    }

    let _ = fs::remove_file(&socket);

    let mut command = if which("setsid").is_some() {
        let mut command = Command::new("setsid");
        command.arg("ydotoold");
        command
    } else {
        Command::new("ydotoold")
    };

    command
        .arg("--socket-path")
        .arg(&socket)
        .arg("--socket-perm")
        .arg("0600")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    command
        .spawn()
        .map_err(|error| format!("não foi possível iniciar ydotoold: {error}"))?;

    let deadline = Instant::now() + Duration::from_millis(2_000);
    while Instant::now() < deadline {
        if socket_alive(&socket) {
            return Ok(socket);
        }
        thread::sleep(Duration::from_millis(40));
    }

    Err(format!(
        "ydotoold não abriu o socket {} em 2 s",
        socket.display()
    ))
}

fn which(binary: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(binary))
        .find(|candidate| candidate.is_file())
}

pub fn inject(combo: &str) -> Result<(), String> {
    let socket = ensure_daemon()?;
    let parsed = parse_combo(combo)?;

    let output = Command::new("ydotool")
        .arg("key")
        .args(parsed.keycodes())
        .env("YDOTOOL_SOCKET", &socket)
        .output()
        .map_err(|error| format!("não foi possível executar ydotool (está instalado?): {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(format!(
            "ydotool saiu com {}: {}",
            output.status.code().unwrap_or(-1),
            if stderr.is_empty() { "sem stderr" } else { &stderr }
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_datagram_conta_como_vivo() {
        let dir = std::env::temp_dir().join(format!("moondeck-sock-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("criar dir");
        let path = dir.join("d.sock");

        assert!(!socket_alive(&path), "sem arquivo não está vivo");

        let _server = UnixDatagram::bind(&path).expect("bind datagram");
        assert!(socket_alive(&path), "ydotoold 1.0 usa datagram");

        fs::remove_dir_all(dir).ok();
    }
}
