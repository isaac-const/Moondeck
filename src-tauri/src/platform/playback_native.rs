//! Saída de som no Windows e no macOS, pelo `rodio`.
//!
//! O fluxo de áudio de algumas plataformas não pode trocar de thread, então
//! uma thread própria é dona da saída e recebe os pedidos por um canal.

use std::{
    io::Cursor,
    sync::{mpsc, OnceLock},
    thread,
};

use rodio::{
    cpal::traits::{DeviceTrait, HostTrait},
    Decoder, OutputStream, OutputStreamHandle, Sink,
};

enum Request {
    Play {
        wav: Vec<u8>,
        device: Option<String>,
        stop_others: bool,
        reply: mpsc::Sender<Result<(), String>>,
    },
    StopAll,
}

fn sender() -> &'static mpsc::Sender<Request> {
    static TX: OnceLock<mpsc::Sender<Request>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || worker(rx));
        tx
    })
}

fn open(device: Option<&str>) -> Result<(OutputStream, OutputStreamHandle), String> {
    let named = device.and_then(|name| {
        rodio::cpal::default_host()
            .output_devices()
            .ok()?
            .find(|candidate| candidate.name().is_ok_and(|n| n == name))
    });
    match named {
        Some(device) => OutputStream::try_from_device(&device),
        // Sem escolha (ou o dispositivo sumiu): a saída padrão do sistema.
        None => OutputStream::try_default(),
    }
    .map_err(|error| format!("não foi possível abrir a saída de som: {error}"))
}

fn worker(requests: mpsc::Receiver<Request>) {
    let mut stream: Option<(Option<String>, OutputStream, OutputStreamHandle)> = None;
    let mut sinks: Vec<Sink> = Vec::new();

    for request in requests {
        match request {
            Request::StopAll => sinks.clear(),
            Request::Play { wav, device, stop_others, reply } => {
                let result = (|| {
                    if stream.as_ref().is_none_or(|(current, _, _)| *current != device) {
                        sinks.clear();
                        let (output, handle) = open(device.as_deref())?;
                        stream = Some((device.clone(), output, handle));
                    }
                    let Some((_, _, handle)) = stream.as_ref() else {
                        return Err("saída de som indisponível".to_string());
                    };
                    sinks.retain(|sink| !sink.empty());
                    if stop_others {
                        sinks.clear();
                    }
                    let decoder = Decoder::new(Cursor::new(wav))
                        .map_err(|error| format!("não foi possível tocar o som: {error}"))?;
                    let sink = Sink::try_new(handle)
                        .map_err(|error| format!("não foi possível tocar o som: {error}"))?;
                    sink.append(decoder);
                    sinks.push(sink);
                    Ok(())
                })();
                if result.is_err() {
                    // Uma saída que falhou (fone desconectado) é reaberta na próxima vez.
                    stream = None;
                }
                let _ = reply.send(result);
            }
        }
    }
}

pub fn play_wav(wav: Vec<u8>, sink: Option<&str>, stop_others: bool) -> Result<(), String> {
    let (reply, wait) = mpsc::channel();
    sender()
        .send(Request::Play { wav, device: sink.map(str::to_string), stop_others, reply })
        .map_err(|_| "a saída de som parou de responder".to_string())?;
    wait.recv().map_err(|_| "a saída de som parou de responder".to_string())?
}

pub fn stop_all() {
    let _ = sender().send(Request::StopAll);
}

/// Sem equivalente fora do PipeWire: as saídas do Windows e do macOS não
/// entram em repouso do jeito que caixas Bluetooth no Linux entram.
pub fn keep_awake(_enabled: bool, _sink: Option<&str>) {}

/// Nomes das saídas de som disponíveis.
pub fn output_names() -> Vec<String> {
    rodio::cpal::default_host()
        .output_devices()
        .map(|devices| devices.filter_map(|device| device.name().ok()).collect())
        .unwrap_or_default()
}
