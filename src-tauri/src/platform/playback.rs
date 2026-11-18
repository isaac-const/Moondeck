//! Saída de som no Linux: o WAV vai para o `pw-play` (PipeWire), um processo
//! por som. Com o microfone virtual ligado, o mesmo som segue também para ele.

use std::{
    io::Write,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
};

/// Sons tocando agora, para "parar o anterior" ter o que parar.
static PLAYING: Mutex<Vec<Child>> = Mutex::new(Vec::new());

fn which(binary: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(binary))
        .find(|candidate| candidate.is_file())
}

pub fn stop_all() {
    if let Ok(mut playing) = PLAYING.lock() {
        for mut child in playing.drain(..) {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn player(sink: Option<&str>) -> Result<Command, String> {
    if which("pw-play").is_none() {
        return Err("o pw-play não está instalado (pacote pipewire)".to_string());
    }
    let mut command = Command::new("pw-play");
    command.arg("--latency").arg("20ms");
    if let Some(sink) = sink {
        command.arg("--target").arg(sink);
    }
    command.arg("-");
    Ok(command)
}

fn spawn_player(mut command: Command, wav: Vec<u8>) -> Result<Child, String> {
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("não foi possível tocar o som: {error}"))?;
    // O WAV vai por stdin numa thread: o player pode ainda estar abrindo o
    // stream e a tecla não espera por isso.
    if let Some(mut stdin) = child.stdin.take() {
        std::thread::spawn(move || {
            let _ = stdin.write_all(&wav);
        });
    }
    Ok(child)
}


/// Toca o WAV na saída escolhida (e no microfone virtual, se ligado).
pub fn play_wav(wav: Vec<u8>, sink: Option<&str>, stop_others: bool) -> Result<(), String> {
    let speakers = player(sink)?;
    let virtual_mic = match super::mic::target() {
        Some(target) => Some(player(Some(target))?),
        None => None,
    };

    if stop_others {
        stop_all();
    } else if let Ok(mut playing) = PLAYING.lock() {
        // Recolhe os que já terminaram para a lista não crescer.
        playing.retain_mut(|child| matches!(child.try_wait(), Ok(None)));
    }

    let mut children = Vec::with_capacity(2);
    // O do microfone primeiro: quem está na chamada não deve ouvir depois de você.
    if let Some(command) = virtual_mic {
        children.push(spawn_player(command, wav.clone())?);
    }
    children.push(spawn_player(speakers, wav)?);

    if let Ok(mut playing) = PLAYING.lock() {
        playing.extend(children);
    }
    Ok(())
}

// ------------------------------------------------------------- saída acordada

struct KeepAwake {
    child: Child,
    sink: Option<String>,
}

static KEEP_AWAKE: Mutex<Option<KeepAwake>> = Mutex::new(None);

/// Caixas e fones Bluetooth (e alguns DACs) entram em repouso quando nada toca
/// e levam algumas centenas de ms para acordar — o começo do primeiro som é
/// engolido. Um fluxo de silêncio, sem custo audível, mantém a saída ligada.
/// Idempotente: chamar de novo só reinicia se o destino mudou.
pub fn keep_awake(enabled: bool, sink: Option<&str>) {
    let Ok(mut slot) = KEEP_AWAKE.lock() else {
        return;
    };
    if let Some(current) = slot.as_mut() {
        let alive = matches!(current.child.try_wait(), Ok(None));
        if enabled && alive && current.sink.as_deref() == sink {
            return;
        }
        if let Some(mut old) = slot.take() {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
    }
    if !enabled || which("pw-play").is_none() {
        return;
    }
    let Ok(zero) = std::fs::File::open("/dev/zero") else {
        return;
    };
    let mut command = Command::new("pw-play");
    command
        .args(["--raw", "--rate", "48000", "--channels", "2", "--format", "s16"])
        .args(["--latency", "100ms", "--media-role", "Production"]);
    if let Some(sink) = sink {
        command.arg("--target").arg(sink);
    }
    command.arg("-");
    match command
        .stdin(Stdio::from(zero))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            *slot = Some(KeepAwake {
                child,
                sink: sink.map(str::to_string),
            });
        }
        Err(error) => log::warn!("não foi possível manter a saída acordada: {error}"),
    }
}

