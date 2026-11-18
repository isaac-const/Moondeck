//! Execução das ações do deck. Cada uma roda numa thread própria: tocar um
//! som de 4 s ou esperar o ydotool nunca pode segurar a captura de teclas.

use std::{
    path::Path,
    process::{Command, Stdio},
};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter};

use crate::config::model::{Action, ActionPayload, AudioSettings, MacroStep};
use crate::platform::inject;
use crate::platform::sound::{self, SoundEdit};

pub const ACTION_EVENT: &str = "engine://action";

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ActionOutcome {
    pub action_id: String,
    pub label: String,
    pub ok: bool,
    /// Fato técnico quando falhou; a UI mostra junto de uma mensagem traduzida.
    pub error: Option<String>,
}

pub fn run(app: &AppHandle, action: &Action, audio: &AudioSettings) {
    let app = app.clone();
    let action = action.clone();
    let audio = audio.clone();

    std::thread::spawn(move || {
        let result = execute(&app, &action, &audio);
        let outcome = ActionOutcome {
            action_id: action.id.clone(),
            label: action.label.clone(),
            ok: result.is_ok(),
            error: result.err(),
        };
        if let Some(error) = &outcome.error {
            log::warn!("ação “{}” falhou: {error}", outcome.label);
        }
        if let Err(error) = app.emit(ACTION_EVENT, outcome) {
            log::warn!("falha ao emitir {ACTION_EVENT}: {error}");
        }
    });
}

fn execute(app: &AppHandle, action: &Action, audio: &AudioSettings) -> Result<(), String> {
    match &action.payload {
        ActionPayload::Sound {
            file,
            volume,
            stop_others,
            start_ms,
            end_ms,
            fade_in_ms,
            fade_out_ms,
        } => sound::play(
            Path::new(file),
            &SoundEdit {
                volume: *volume,
                start_ms: *start_ms,
                end_ms: *end_ms,
                fade_in_ms: *fade_in_ms,
                fade_out_ms: *fade_out_ms,
            },
            audio.volume,
            audio.sink.as_deref(),
            *stop_others || audio.stop_previous_sound,
        )
        .map(|_| ()),
        ActionPayload::Voice { effect, hold } => {
            // Push-to-talk: o efeito é ligado aqui e desligado quando a tecla
            // solta (`engine::handle_activation`).
            if *hold {
                crate::platform::mic::set_voice(app, Some(*effect), audio);
            } else {
                crate::platform::mic::toggle_voice(app, *effect, audio);
            }
            Ok(())
        }
        ActionPayload::Macro { steps } => run_macro(steps, audio),
        ActionPayload::Shortcut { combo } => inject::inject(combo),
        ActionPayload::App { command, args } => launch(command, args),
    }
}

fn launch(command: &str, args: &[String]) -> Result<(), String> {
    match spawn(command, args) {
        Ok(()) => Ok(()),
        // Digitaram o nome do programa ("Modrinth App"), não o executável:
        // procura entre os instalados.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            launch_by_name(command, args).ok_or_else(|| format!("não foi possível abrir {command}: {error}"))?
        }
        Err(error) => Err(format!("não foi possível abrir {command}: {error}")),
    }
}

/// Abre um programa pelo nome, quando o texto não é um executável. `None` se
/// o sistema não sabe de nenhum com esse nome.
#[cfg(target_os = "linux")]
fn launch_by_name(name: &str, args: &[String]) -> Option<Result<(), String>> {
    let app = crate::platform::apps::find_by_name(name)?;
    let mut all = app.args;
    all.extend(args.iter().cloned());
    Some(spawn(&app.command, &all).map_err(|error| format!("não foi possível abrir {}: {error}", app.name)))
}

/// macOS: `open -a Nome` abre qualquer app instalado pelo nome.
#[cfg(target_os = "macos")]
fn launch_by_name(name: &str, args: &[String]) -> Option<Result<(), String>> {
    let mut all = vec!["-a".to_string(), name.to_string()];
    if !args.is_empty() {
        all.push("--args".to_string());
        all.extend(args.iter().cloned());
    }
    Some(spawn("open", &all).map_err(|error| format!("não foi possível abrir {name}: {error}")))
}

/// Windows: `start` resolve nomes registrados no sistema (App Paths e PATH).
/// Como passa pelo `cmd`, textos com caracteres especiais dele são recusados.
#[cfg(target_os = "windows")]
fn launch_by_name(name: &str, args: &[String]) -> Option<Result<(), String>> {
    const SPECIAL: &[char] = &['&', '|', '<', '>', '^', '%', '"', '\n', '\r'];
    if name.contains(SPECIAL) || args.iter().any(|arg| arg.contains(SPECIAL)) {
        return Some(Err(format!("não foi possível abrir {name}: o nome tem caracteres que o Windows não aceita aqui")));
    }
    let mut all = vec!["/C".to_string(), "start".to_string(), String::new(), name.to_string()];
    all.extend(args.iter().cloned());
    Some(spawn("cmd", &all).map_err(|error| format!("não foi possível abrir {name}: {error}")))
}

fn spawn(command: &str, args: &[String]) -> std::io::Result<()> {
    let mut cmd = Command::new(command);
    cmd.args(args).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    // Grupo próprio: fechar o MoonDeck não derruba o programa aberto por ele.
    #[cfg(unix)]
    std::os::unix::process::CommandExt::process_group(&mut cmd, 0);
    // Windows: sem janela de console piscando para programas de terminal.
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000);
    let mut child = cmd.spawn()?;
    // O programa segue vivo sozinho; só precisamos recolher o código de saída
    // para não deixar zumbi.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Executa os passos em ordem. Um passo que falha interrompe a sequência: seguir
/// adiante com um atalho que não rodou costuma fazer estrago.
fn run_macro(steps: &[MacroStep], audio: &AudioSettings) -> Result<(), String> {
    for step in steps {
        match step {
            MacroStep::Shortcut { combo } => {
                inject::inject(combo)?;
            }
            MacroStep::Wait { ms } => std::thread::sleep(std::time::Duration::from_millis(u64::from(*ms))),
            MacroStep::Sound { file } => {
                sound::play(
                    Path::new(file),
                    &SoundEdit {
                        volume: 100,
                        start_ms: 0,
                        end_ms: 0,
                        fade_in_ms: 0,
                        fade_out_ms: 0,
                    },
                    audio.volume,
                    audio.sink.as_deref(),
                    false,
                )?;
            }
        }
    }
    Ok(())
}
