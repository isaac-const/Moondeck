//! "Iniciar com o sistema". No Linux, uma entrada em `~/.config/autostart`, o
//! mecanismo XDG que o KDE, o GNOME e os outros ambientes leem no login. No
//! Windows e no macOS, o plugin `autostart` (registro do Windows, LaunchAgent).
//!
//! O `Exec` aponta para o binário em execução. Num build de desenvolvimento
//! isso é o binário de `target/debug`, que depende do servidor do Vite — a
//! entrada só faz sentido de verdade no app instalado.

use tauri::AppHandle;

use crate::config::model::General;

/// Argumento que o MoonDeck recebe quando o sistema o abre: fica só na bandeja.
pub const HIDDEN_ARG: &str = "--hidden";

#[cfg(target_os = "linux")]
fn entry_path() -> Option<std::path::PathBuf> {
    let config_home = std::env::var_os("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".config")))?;
    Some(config_home.join("autostart").join(format!("{}.desktop", super::hotkeys::APP_ID)))
}

/// `Exec` do .desktop: aspas e escapes para caminhos com espaço.
#[cfg(target_os = "linux")]
fn quote_exec(path: &str) -> String {
    let needs_quotes = path.chars().any(|c| " \t\"'\\><~|&;$*?#()`".contains(c));
    if !needs_quotes {
        return path.to_string();
    }
    let mut out = String::from("\"");
    for c in path.chars() {
        if matches!(c, '"' | '`' | '$' | '\\') {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
    out
}

#[cfg(target_os = "linux")]
fn contents(exe: &str, minimized: bool) -> String {
    let exec = if minimized {
        format!("{} {HIDDEN_ARG}", quote_exec(exe))
    } else {
        quote_exec(exe)
    };
    format!(
        "[Desktop Entry]\nType=Application\nName=MoonDeck\nComment=Teclas subutilizadas viram um deck de ações\nExec={exec}\nIcon={app_id}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n",
        app_id = super::hotkeys::APP_ID
    )
}

/// Faz o sistema refletir a config: cria, atualiza ou remove a entrada.
#[cfg(target_os = "linux")]
pub fn sync(_app: &AppHandle, general: &General) -> Result<(), String> {
    let Some(path) = entry_path() else {
        return Err("sem $HOME para configurar o início automático".to_string());
    };

    if !general.start_on_boot {
        return match std::fs::remove_file(&path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(format!("não foi possível remover {}: {error}", path.display())),
        };
    }

    let exe = std::env::current_exe()
        .map_err(|error| format!("não foi possível descobrir o executável: {error}"))?;
    let wanted = contents(&exe.display().to_string(), general.start_minimized);
    if std::fs::read_to_string(&path).is_ok_and(|existing| existing == wanted) {
        return Ok(());
    }
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)
            .map_err(|error| format!("não foi possível criar {}: {error}", dir.display()))?;
    }
    std::fs::write(&path, wanted)
        .map_err(|error| format!("não foi possível gravar {}: {error}", path.display()))?;
    log::info!("início automático gravado em {}", path.display());
    Ok(())
}

#[cfg(not(target_os = "linux"))]
pub fn sync(app: &AppHandle, general: &General) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let launcher = app.autolaunch();
    let enabled = launcher.is_enabled().map_err(|error| error.to_string())?;
    match (general.start_on_boot, enabled) {
        (true, false) => launcher.enable().map_err(|error| error.to_string()),
        (false, true) => launcher.disable().map_err(|error| error.to_string()),
        _ => Ok(()),
    }
}

/// Foi o sistema (ou o usuário, com a flag) que pediu para abrir sem janela?
pub fn started_hidden() -> bool {
    std::env::args().any(|arg| arg == HIDDEN_ARG)
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn exec_com_espaco_vai_entre_aspas() {
        assert_eq!(quote_exec("/usr/bin/moondeck"), "/usr/bin/moondeck");
        assert_eq!(quote_exec("/opt/Moon Deck/app"), "\"/opt/Moon Deck/app\"");
    }

    #[test]
    fn minimizado_acrescenta_a_flag() {
        assert!(contents("/usr/bin/moondeck", true).contains("Exec=/usr/bin/moondeck --hidden\n"));
        assert!(contents("/usr/bin/moondeck", false).contains("Exec=/usr/bin/moondeck\n"));
    }
}
