//! Microfone virtual do MoonDeck e efeitos de voz.
//!
//! O que existe no PipeWire quando isto está ligado:
//!
//! ```text
//!   microfone real ─► (MoonDeck: efeito de voz) ─► moondeck_mix ─┐
//!   sons do deck   ────────────────────────────► moondeck_mix ─┤
//!                                                              ▼
//!                          moondeck_mix.monitor ─► "MoonDeck Mic"  (o que o
//!                                                  Discord/OBS/etc. escolhem)
//! ```
//!
//! `moondeck_mix` é um sink nulo (nada sai dele); `moondeck_mic` é a fonte que
//! reexpõe o monitor dele como um microfone de verdade. Os sons do deck tocam
//! nos alto-falantes **e** em `moondeck_mix`, então você ouve e quem está na
//! chamada também ouve. Sem este recurso ligado, os sons só vão para a saída
//! normal — o microfone não os capta.
//!
//! A voz passa por um processo `pw-record` → thread de DSP → `pw-play`, em
//! blocos de 20 ms. O efeito é trocado sem reiniciar nada.

use std::{
    io::{Read, Write},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU8, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
};

use serde::Serialize;
use specta::Type;
use tauri::{AppHandle, Emitter};

use crate::config::model::{AudioSettings, VoiceEffect};

pub const MIX_SINK: &str = "moondeck_mix";
pub const MIC_SOURCE: &str = "moondeck_mic";
pub const STATUS_EVENT: &str = "mic://status";

const RATE: u32 = 48_000;
/// 20 ms de áudio mono 16 bits por bloco.
const BLOCK_SAMPLES: usize = 960;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MicStatus {
    /// O microfone virtual existe e a voz está passando por ele.
    pub running: bool,
    pub voice: Option<VoiceEffect>,
    /// Microfone real em uso.
    pub source: Option<String>,
    pub error: Option<String>,
}

struct Bridge {
    stop: Arc<AtomicBool>,
    join: Option<JoinHandle<()>>,
    source: String,
    monitor: bool,
    sink: Option<String>,
}

struct Runtime {
    bridge: Option<Bridge>,
    error: Option<String>,
}

static RUNTIME: Mutex<Runtime> = Mutex::new(Runtime {
    bridge: None,
    error: None,
});
/// 0 = sem efeito; 1.. = posição em `EFFECTS` + 1. Atômico: a thread de áudio lê a cada bloco.
static VOICE: AtomicU8 = AtomicU8::new(0);

const EFFECTS: [VoiceEffect; 11] = [
    VoiceEffect::Deep,
    VoiceEffect::High,
    VoiceEffect::Robot,
    VoiceEffect::Echo,
    VoiceEffect::Monster,
    VoiceEffect::Chipmunk,
    VoiceEffect::Radio,
    VoiceEffect::Whisper,
    VoiceEffect::Distortion,
    VoiceEffect::Cave,
    VoiceEffect::Alien,
];

fn encode(effect: Option<VoiceEffect>) -> u8 {
    effect.map_or(0, |effect| {
        EFFECTS.iter().position(|candidate| *candidate == effect).map_or(0, |index| index as u8 + 1)
    })
}

fn decode(value: u8) -> Option<VoiceEffect> {
    usize::from(value).checked_sub(1).and_then(|index| EFFECTS.get(index).copied())
}

pub fn voice() -> Option<VoiceEffect> {
    decode(VOICE.load(Ordering::Acquire))
}

/// Para onde os sons do deck vão, além da saída normal. `None` com o recurso
/// desligado.
#[cfg(target_os = "linux")]
pub fn target() -> Option<&'static str> {
    RUNTIME
        .lock()
        .ok()
        .filter(|runtime| runtime.bridge.is_some())
        .map(|_| MIX_SINK)
}

pub fn status() -> MicStatus {
    let (running, source, error) = match RUNTIME.lock() {
        Ok(runtime) => (
            runtime.bridge.is_some(),
            runtime.bridge.as_ref().map(|bridge| bridge.source.clone()),
            runtime.error.clone(),
        ),
        Err(_) => (false, None, Some("estado do microfone corrompido".to_string())),
    };
    MicStatus {
        running,
        voice: voice(),
        source,
        error,
    }
}

fn publish(app: &AppHandle) {
    let _ = app.emit(STATUS_EVENT, status());
}

// ----------------------------------------------------------------- pactl

fn pactl(args: &[&str]) -> Result<String, String> {
    let output = Command::new("pactl")
        .args(args)
        .output()
        .map_err(|error| format!("não foi possível executar pactl: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "pactl {}: {}",
            args.join(" "),
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Nomes (segunda coluna) de `pactl list short <kind>`.
fn names(kind: &str) -> Result<Vec<String>, String> {
    Ok(pactl(&["list", "short", kind])?
        .lines()
        .filter_map(|line| line.split('\t').nth(1))
        .map(str::to_string)
        .collect())
}

/// Cria o sink nulo e a fonte virtual, se ainda não existem. Idempotente: um
/// resto de execução anterior é reaproveitado.
fn ensure_devices() -> Result<(), String> {
    if !names("sinks")?.iter().any(|name| name == MIX_SINK) {
        pactl(&[
            "load-module",
            "module-null-sink",
            &format!("sink_name={MIX_SINK}"),
            "sink_properties=device.description=\"MoonDeck Mix\"",
        ])?;
    }
    if !names("sources")?.iter().any(|name| name == MIC_SOURCE) {
        pactl(&[
            "load-module",
            "module-remap-source",
            &format!("master={MIX_SINK}.monitor"),
            &format!("source_name={MIC_SOURCE}"),
            "source_properties=device.description=\"MoonDeck Mic\"",
        ])?;
    }
    Ok(())
}

/// Descarrega o que o MoonDeck criou.
fn remove_devices() {
    let Ok(modules) = pactl(&["list", "short", "modules"]) else {
        return;
    };
    for line in modules.lines() {
        let mut columns = line.split('\t');
        let (Some(id), Some(_name), Some(args)) = (columns.next(), columns.next(), columns.next())
        else {
            continue;
        };
        if args.contains(&format!("sink_name={MIX_SINK}"))
            || args.contains(&format!("source_name={MIC_SOURCE}"))
        {
            let _ = pactl(&["unload-module", id]);
        }
    }
}

/// O microfone real: o escolhido, ou o padrão do sistema — nunca o nosso, nem
/// um monitor (ouviria os alto-falantes).
fn real_source(preferred: Option<&str>) -> Result<String, String> {
    let all = names("sources")?;
    let usable = |name: &str| name != MIC_SOURCE && !name.ends_with(".monitor");

    if let Some(name) = preferred.filter(|name| all.iter().any(|candidate| candidate == name)) {
        if usable(name) {
            return Ok(name.to_string());
        }
    }
    let default = pactl(&["get-default-source"])?.trim().to_string();
    if usable(&default) && all.iter().any(|name| *name == default) {
        return Ok(default);
    }
    all.into_iter()
        .find(|name| usable(name))
        .ok_or_else(|| "nenhum microfone encontrado".to_string())
}

// ------------------------------------------------------------------- ponte

fn start(source: String, monitor: bool, sink: Option<String>) -> Result<Bridge, String> {
    ensure_devices()?;

    let spawn_error = |tool: &str, error: std::io::Error| format!("não foi possível abrir {tool}: {error}");
    let mut capture = Command::new("pw-record")
        .args(["--raw", "--rate", &RATE.to_string(), "--channels", "1"])
        .args(["--format", "s16", "--latency", "20ms", "--target", &source, "-"])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| spawn_error("pw-record", error))?;
    let mut playback = Command::new("pw-play")
        .args(["--raw", "--rate", &RATE.to_string(), "--channels", "1"])
        .args(["--format", "s16", "--latency", "60ms", "--target", MIX_SINK, "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            let _ = capture.kill();
            spawn_error("pw-play", error)
        })?;

    // Ouvir a própria voz: uma cópia vai para os alto-falantes.
    let mut listen = if monitor {
        let mut command = Command::new("pw-play");
        command
            .args(["--raw", "--rate", &RATE.to_string(), "--channels", "1"])
            .args(["--format", "s16", "--latency", "60ms"]);
        if let Some(sink) = &sink {
            command.args(["--target", sink]);
        }
        command
            .arg("-")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()
    } else {
        None
    };
    let listen_in = listen.as_mut().and_then(|child| child.stdin.take());

    let (Some(input), Some(output)) = (capture.stdout.take(), playback.stdin.take()) else {
        let _ = capture.kill();
        let _ = playback.kill();
        return Err("os processos de áudio não abriram os canais".to_string());
    };

    let stop = Arc::new(AtomicBool::new(false));
    let join = {
        let stop = stop.clone();
        std::thread::spawn(move || pump(input, output, listen_in, capture, playback, listen, &stop))
    };
    Ok(Bridge {
        stop,
        join: Some(join),
        source,
        monitor,
        sink,
    })
}

/// Lê um bloco, aplica o efeito, escreve. Termina quando alguém pede (`stop`)
/// ou quando um dos processos some (microfone desconectado, PipeWire reiniciou).
fn pump(
    mut input: impl Read,
    mut output: impl Write,
    mut listen_in: Option<impl Write>,
    mut capture: Child,
    mut playback: Child,
    mut listen: Option<Child>,
    stop: &AtomicBool,
) {
    let mut dsp = Dsp::new();
    let mut raw = [0u8; BLOCK_SAMPLES * 2];
    let mut block = [0f32; BLOCK_SAMPLES];

    while !stop.load(Ordering::Acquire) {
        if input.read_exact(&mut raw).is_err() {
            break;
        }
        for (sample, bytes) in block.iter_mut().zip(raw.chunks_exact(2)) {
            *sample = f32::from(i16::from_le_bytes([bytes[0], bytes[1]])) / 32_768.0;
        }
        dsp.process(voice(), &mut block);
        for (sample, bytes) in block.iter().zip(raw.chunks_exact_mut(2)) {
            let value = (sample.clamp(-0.98, 0.98) * 32_767.0) as i16;
            bytes.copy_from_slice(&value.to_le_bytes());
        }
        if output.write_all(&raw).is_err() {
            break;
        }
        if let Some(listener) = listen_in.as_mut() {
            if listener.write_all(&raw).is_err() {
                listen_in = None;
            }
        }
    }

    let _ = capture.kill();
    let _ = playback.kill();
    if let Some(child) = listen.as_mut() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let _ = capture.wait();
    let _ = playback.wait();
    if !stop.load(Ordering::Acquire) {
        // Caiu sozinha: deixa registrado para a interface mostrar.
        if let Ok(mut runtime) = RUNTIME.lock() {
            runtime.bridge = None;
            runtime.error = Some("o microfone virtual parou (o microfone foi desconectado?)".to_string());
        }
    }
}

fn stop_bridge(runtime: &mut Runtime) {
    if let Some(mut bridge) = runtime.bridge.take() {
        bridge.stop.store(true, Ordering::Release);
        if let Some(join) = bridge.join.take() {
            // A thread pode estar bloqueada lendo do microfone: matar o
            // `pw-record` (feito por ela ao sair) a desbloqueia. Dá uma folga.
            std::thread::spawn(move || {
                let _ = join.join();
            });
        }
    }
}

/// Faz a ponte refletir a config e o efeito atual. Barato quando nada mudou.
pub fn apply(app: &AppHandle, audio: &AudioSettings) {
    let wanted = audio.mic_routing || voice().is_some();
    let result = (|| -> Result<(), String> {
        let mut runtime = RUNTIME.lock().map_err(|_| "estado do microfone corrompido".to_string())?;
        // Uma ponte que caiu sozinha está `None`: tentar de novo é seguro.
        if !wanted {
            let was_running = runtime.bridge.is_some();
            stop_bridge(&mut runtime);
            runtime.error = None;
            drop(runtime);
            if was_running {
                remove_devices();
            }
            return Ok(());
        }
        let source = real_source(audio.mic_source.as_deref())?;
        let sink = audio.sink.clone();
        if runtime.bridge.as_ref().is_some_and(|bridge| {
            bridge.source == source && bridge.monitor == audio.mic_monitor && bridge.sink == sink
        }) {
            return Ok(());
        }
        stop_bridge(&mut runtime);
        runtime.bridge = Some(start(source, audio.mic_monitor, sink)?);
        runtime.error = None;
        Ok(())
    })();

    if let Err(error) = result {
        log::warn!("microfone virtual: {error}");
        if let Ok(mut runtime) = RUNTIME.lock() {
            runtime.error = Some(error);
        }
    }
    publish(app);
}

/// Liga o efeito (ou desliga, se já era ele). Devolve o efeito resultante.
pub fn toggle_voice(app: &AppHandle, effect: VoiceEffect, audio: &AudioSettings) -> Option<VoiceEffect> {
    let next = if voice() == Some(effect) { None } else { Some(effect) };
    set_voice(app, next, audio);
    next
}

/// Define o efeito atual (push-to-talk liga ao apertar e desliga ao soltar).
pub fn set_voice(app: &AppHandle, effect: Option<VoiceEffect>, audio: &AudioSettings) {
    if voice() == effect {
        return;
    }
    VOICE.store(encode(effect), Ordering::Release);
    apply(app, audio);
}

/// Ao sair: solta processos e remove os dispositivos virtuais.
pub fn shutdown() {
    if let Ok(mut runtime) = RUNTIME.lock() {
        stop_bridge(&mut runtime);
    }
    remove_devices();
}

/// O estado atual, para a interface ao abrir.
#[tauri::command]
#[specta::specta]
pub fn mic_status() -> MicStatus {
    status()
}

// --------------------------------------------------------------------- DSP

const PITCH_WINDOW: usize = 2_048;
const PITCH_BUFFER: usize = 4_096;
const ECHO_SAMPLES: usize = (RATE as usize) * 300 / 1_000;

/// Estado de todos os efeitos. Cada um mantém o seu e só roda quando ativo.
struct Dsp {
    pitch: Pitch,
    echo: Vec<f32>,
    echo_pos: usize,
    carrier: f32,
    last: Option<VoiceEffect>,
    /// Filtros de um polo (rádio, distorção, sussurro).
    low: f32,
    band: f32,
    envelope: f32,
    noise: u32,
    /// Linhas de atraso da caverna.
    cave: [Vec<f32>; 3],
    cave_pos: [usize; 3],
    tremolo: f32,
}

/// Atrasos (em amostras a 48 kHz) das três reflexões da caverna; primos entre
/// si para as reflexões não se alinharem e soarem metálicas.
const CAVE_DELAYS: [usize; 3] = [1_687, 2_269, 3_011];

/// Coeficiente de um filtro de um polo para a frequência de corte `hz`.
fn one_pole(hz: f32) -> f32 {
    1.0 - (-std::f32::consts::TAU * hz / RATE as f32).exp()
}

impl Dsp {
    fn new() -> Self {
        Self {
            pitch: Pitch::new(),
            echo: vec![0.0; ECHO_SAMPLES],
            echo_pos: 0,
            carrier: 0.0,
            last: None,
            low: 0.0,
            band: 0.0,
            envelope: 0.0,
            noise: 0x1234_5678,
            cave: CAVE_DELAYS.map(|len| vec![0.0; len]),
            cave_pos: [0; 3],
            tremolo: 0.0,
        }
    }

    fn process(&mut self, effect: Option<VoiceEffect>, block: &mut [f32]) {
        if effect != self.last {
            // Troca de efeito: limpa os restos do anterior (nada de eco de um
            // efeito que já saiu).
            self.pitch = Pitch::new();
            self.echo.iter_mut().for_each(|sample| *sample = 0.0);
            self.cave.iter_mut().for_each(|line| line.iter_mut().for_each(|sample| *sample = 0.0));
            self.low = 0.0;
            self.band = 0.0;
            self.envelope = 0.0;
            self.last = effect;
        }
        match effect {
            None => {}
            Some(VoiceEffect::Deep) => block.iter_mut().for_each(|x| *x = self.pitch.tick(*x, 0.76)),
            Some(VoiceEffect::High) => block.iter_mut().for_each(|x| *x = self.pitch.tick(*x, 1.32)),
            Some(VoiceEffect::Robot) => {
                const CARRIER_HZ: f32 = 48.0;
                for x in block.iter_mut() {
                    self.carrier = (self.carrier + CARRIER_HZ / RATE as f32).fract();
                    let wave = (self.carrier * std::f32::consts::TAU).sin();
                    *x = *x * 0.3 + *x * wave * 0.95;
                }
            }
            Some(VoiceEffect::Echo) => {
                for x in block.iter_mut() {
                    let delayed = self.echo[self.echo_pos];
                    self.echo[self.echo_pos] = *x + delayed * 0.38;
                    self.echo_pos = (self.echo_pos + 1) % ECHO_SAMPLES;
                    *x = *x * 0.9 + delayed * 0.55;
                }
            }
            Some(VoiceEffect::Monster) => {
                const CARRIER_HZ: f32 = 28.0;
                for x in block.iter_mut() {
                    let deep = self.pitch.tick(*x, 0.6);
                    self.carrier = (self.carrier + CARRIER_HZ / RATE as f32).fract();
                    let wave = (self.carrier * std::f32::consts::TAU).sin();
                    *x = (deep * 0.75 + deep * wave * 0.45).clamp(-1.0, 1.0);
                }
            }
            Some(VoiceEffect::Chipmunk) => block.iter_mut().for_each(|x| *x = self.pitch.tick(*x, 1.65)),
            Some(VoiceEffect::Radio) => {
                // Voz de rádio/telefone: só entre ~400 Hz e ~3 kHz, com um
                // pouco de saturação.
                let (high_pass, low_pass) = (one_pole(400.0), one_pole(3_000.0));
                for x in block.iter_mut() {
                    self.low += high_pass * (*x - self.low);
                    let voice = *x - self.low;
                    self.band += low_pass * (voice - self.band);
                    *x = (self.band * 2.4).tanh() * 0.8;
                }
            }
            Some(VoiceEffect::Whisper) => {
                // Ruído com o contorno de volume da voz: sai só o "ar".
                let (rise, fall) = (0.02, 0.002);
                let high_pass = one_pole(1_500.0);
                for x in block.iter_mut() {
                    let level = x.abs();
                    self.envelope += (level - self.envelope) * if level > self.envelope { rise } else { fall };
                    self.noise ^= self.noise << 13;
                    self.noise ^= self.noise >> 17;
                    self.noise ^= self.noise << 5;
                    let white = (self.noise as f32 / u32::MAX as f32) * 2.0 - 1.0;
                    self.low += high_pass * (white - self.low);
                    *x = ((white - self.low) * self.envelope * 4.5).clamp(-1.0, 1.0);
                }
            }
            Some(VoiceEffect::Distortion) => {
                let (high_pass, low_pass) = (one_pole(250.0), one_pole(4_500.0));
                for x in block.iter_mut() {
                    self.low += high_pass * (*x - self.low);
                    let voice = *x - self.low;
                    self.band += low_pass * (voice - self.band);
                    *x = (self.band * 9.0).tanh() * 0.55;
                }
            }
            Some(VoiceEffect::Cave) => {
                for x in block.iter_mut() {
                    let mut wet = 0.0;
                    for (line, pos) in self.cave.iter_mut().zip(self.cave_pos.iter_mut()) {
                        let delayed = line[*pos];
                        line[*pos] = *x + delayed * 0.55;
                        *pos = (*pos + 1) % line.len();
                        wet += delayed;
                    }
                    *x = *x * 0.8 + wet * 0.3;
                }
            }
            Some(VoiceEffect::Alien) => {
                // Um pouco mais agudo, com a amplitude tremendo (~9 Hz).
                for x in block.iter_mut() {
                    let high = self.pitch.tick(*x, 1.18);
                    self.tremolo = (self.tremolo + 9.0 / RATE as f32).fract();
                    let wobble = 0.55 + 0.45 * (self.tremolo * std::f32::consts::TAU).sin();
                    *x = high * wobble * 1.3;
                }
            }
        }
    }
}

/// Troca de tom no tempo: duas "cabeças" de leitura que andam numa linha de
/// atraso a velocidades diferentes da de escrita, com um fade cruzado entre
/// elas. Soa como voz (não como fita acelerada) e custa quase nada. `ratio`
/// < 1 deixa grave; > 1, agudo.
struct Pitch {
    buffer: Vec<f32>,
    write: usize,
    phase: f32,
}

impl Pitch {
    fn new() -> Self {
        Self {
            buffer: vec![0.0; PITCH_BUFFER],
            write: 0,
            phase: 0.0,
        }
    }

    fn read(&self, delay: f32) -> f32 {
        let position = self.write as f32 - delay;
        let wrapped = position.rem_euclid(PITCH_BUFFER as f32);
        let index = wrapped.floor() as usize;
        let fraction = wrapped - index as f32;
        let a = self.buffer[index % PITCH_BUFFER];
        let b = self.buffer[(index + 1) % PITCH_BUFFER];
        a + (b - a) * fraction
    }

    fn tick(&mut self, input: f32, ratio: f32) -> f32 {
        self.buffer[self.write] = input;
        let window = PITCH_WINDOW as f32;
        let second = (self.phase + 0.5).fract();
        let gain = |phase: f32| 0.5 - 0.5 * (phase * std::f32::consts::TAU).cos();
        let out = gain(self.phase) * self.read(self.phase * window)
            + gain(second) * self.read(second * window);

        self.phase += (1.0 - ratio) / window;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        } else if self.phase < 0.0 {
            self.phase += 1.0;
        }
        self.write = (self.write + 1) % PITCH_BUFFER;
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Frequência pela mediana do intervalo entre cruzamentos de zero (subindo):
    /// um buraco de silêncio no meio da gravação não a desvia.
    fn frequency(samples: &[f32]) -> f32 {
        let crossings: Vec<usize> = samples
            .windows(2)
            .enumerate()
            .filter(|(_, pair)| pair[0] <= 0.0 && pair[1] > 0.0)
            .map(|(index, _)| index)
            .collect();
        if crossings.len() < 3 {
            return 0.0;
        }
        let mut gaps: Vec<usize> = crossings.windows(2).map(|pair| pair[1] - pair[0]).collect();
        gaps.sort_unstable();
        RATE as f32 / gaps[gaps.len() / 2] as f32
    }

    /// Quantos buracos (intervalos bem maiores que o período) a gravação tem.
    fn dropouts(samples: &[f32], expected_hz: f32) -> usize {
        let limit = (RATE as f32 / expected_hz * 1.6) as usize;
        let crossings: Vec<usize> = samples
            .windows(2)
            .enumerate()
            .filter(|(_, pair)| pair[0] <= 0.0 && pair[1] > 0.0)
            .map(|(index, _)| index)
            .collect();
        crossings.windows(2).filter(|pair| pair[1] - pair[0] > limit).count()
    }

    fn sine(hz: f32, seconds: f32) -> Vec<f32> {
        (0..(RATE as f32 * seconds) as usize)
            .map(|n| (n as f32 / RATE as f32 * hz * std::f32::consts::TAU).sin() * 0.5)
            .collect()
    }

    #[test]
    fn efeitos_mudam_o_tom_como_esperado() {
        for (effect, expected) in [(VoiceEffect::High, 440.0 * 1.32), (VoiceEffect::Deep, 440.0 * 0.76)] {
            let mut dsp = Dsp::new();
            let mut samples = sine(440.0, 2.0);
            for block in samples.chunks_mut(BLOCK_SAMPLES) {
                dsp.process(Some(effect), block);
            }
            // Ignora o início, em que a linha de atraso ainda enche.
            let measured = frequency(&samples[RATE as usize / 2..]);
            assert!(
                (measured - expected).abs() / expected < 0.06,
                "{effect:?}: esperado ~{expected:.0} Hz, medido {measured:.0} Hz"
            );
        }
    }

    #[test]
    fn sem_efeito_o_sinal_passa_intacto() {
        let mut dsp = Dsp::new();
        let original = sine(300.0, 0.2);
        let mut samples = original.clone();
        for block in samples.chunks_mut(BLOCK_SAMPLES) {
            dsp.process(None, block);
        }
        assert_eq!(samples, original);
    }

    #[test]
    fn nenhum_efeito_estoura_nem_gera_valor_invalido() {
        for effect in EFFECTS {
            let mut dsp = Dsp::new();
            let mut samples = sine(200.0, 3.0);
            for block in samples.chunks_mut(BLOCK_SAMPLES) {
                dsp.process(Some(effect), block);
            }
            assert!(
                samples.iter().all(|sample| sample.is_finite() && sample.abs() < 2.0),
                "{effect:?} produziu valor fora da faixa"
            );
        }
    }

    #[test]
    fn efeitos_novos_mudam_o_sinal() {
        for effect in [VoiceEffect::Radio, VoiceEffect::Distortion, VoiceEffect::Cave, VoiceEffect::Whisper] {
            let mut dsp = Dsp::new();
            let original = sine(300.0, 1.0);
            let mut samples = original.clone();
            for block in samples.chunks_mut(BLOCK_SAMPLES) {
                dsp.process(Some(effect), block);
            }
            assert_ne!(samples, original, "{effect:?} não alterou o sinal");
        }
    }

    #[test]
    fn efeito_codifica_e_decodifica() {
        for effect in std::iter::once(None).chain(EFFECTS.into_iter().map(Some)) {
            assert_eq!(decode(encode(effect)), effect);
        }
    }

    /// Teste de ponta a ponta no PipeWire de verdade (`cargo test -- --ignored`):
    /// toca um tom de 440 Hz num "microfone" falso, liga a ponte e mede, no
    /// MoonDeck Mic, a frequência com e sem efeito. Cria e remove dispositivos
    /// virtuais temporários.
    #[test]
    #[ignore = "usa o PipeWire real"]
    fn ponte_leva_a_voz_ate_o_microfone_virtual() {
        use std::io::Write;
        use std::process::{Command, Stdio};
        use std::time::Duration;

        fn wav(seconds: f32) -> Vec<u8> {
            let rate = RATE;
            let frames = (rate as f32 * seconds) as u32;
            let mut data = Vec::new();
            for n in 0..frames {
                let v = ((n as f32 / rate as f32 * 440.0 * std::f32::consts::TAU).sin() * 0.5 * 32767.0) as i16;
                data.extend_from_slice(&v.to_le_bytes());
            }
            let mut out = Vec::new();
            out.extend_from_slice(b"RIFF");
            out.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
            out.extend_from_slice(b"WAVEfmt ");
            out.extend_from_slice(&16u32.to_le_bytes());
            out.extend_from_slice(&1u16.to_le_bytes());
            out.extend_from_slice(&1u16.to_le_bytes());
            out.extend_from_slice(&rate.to_le_bytes());
            out.extend_from_slice(&(rate * 2).to_le_bytes());
            out.extend_from_slice(&2u16.to_le_bytes());
            out.extend_from_slice(&16u16.to_le_bytes());
            out.extend_from_slice(b"data");
            out.extend_from_slice(&(data.len() as u32).to_le_bytes());
            out.extend_from_slice(&data);
            out
        }

        // Um "microfone" de mentira: um sink nulo cujo monitor vira uma fonte.
        let module = pactl(&["load-module", "module-null-sink", "sink_name=moondeck_test_fake"])
            .expect("sink falso")
            .trim()
            .to_string();
        let source_module = pactl(&[
            "load-module",
            "module-remap-source",
            "master=moondeck_test_fake.monitor",
            "source_name=moondeck_test_src",
        ])
        .expect("fonte falsa")
        .trim()
        .to_string();
        let result = std::panic::catch_unwind(|| {
            let mut bridge = start("moondeck_test_src".to_string(), false, None).expect("ponte");
            std::thread::sleep(Duration::from_millis(600));

            let measure = |effect: Option<VoiceEffect>| -> f32 {
                VOICE.store(encode(effect), Ordering::Release);
                let mut tone = Command::new("pw-play")
                    .args(["--target", "moondeck_test_fake", "-"])
                    .stdin(Stdio::piped())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                    .expect("pw-play");
                let mut stdin = tone.stdin.take().expect("stdin");
                let bytes = wav(3.0);
                std::thread::spawn(move || {
                    let _ = stdin.write_all(&bytes);
                });
                std::thread::sleep(Duration::from_millis(900));
                let capture = Command::new("pw-record")
                    .args(["--raw", "--rate", "48000", "--channels", "1", "--format", "s16"])
                    .args(["--target", MIC_SOURCE, "-n", "48000", "-"])
                    .output()
                    .expect("pw-record");
                let _ = tone.kill();
                let _ = tone.wait();
                let samples: Vec<f32> = capture
                    .stdout
                    .chunks_exact(2)
                    .map(|b| f32::from(i16::from_le_bytes([b[0], b[1]])) / 32768.0)
                    .collect();
                let peak = samples.iter().fold(0f32, |m, s| m.max(s.abs()));
                eprintln!("efeito {effect:?}: {} amostras, pico {peak:.3}", samples.len());
                assert!(samples.len() > 40_000, "gravou só {} amostras", samples.len());
                eprintln!("  buracos: {}", dropouts(&samples, if effect.is_some() { 580.0 } else { 440.0 }));
                frequency(&samples)
            };

            let plain = measure(None);
            let high = measure(Some(VoiceEffect::High));
            stop_bridge(&mut Runtime { bridge: Some(Bridge { stop: bridge.stop.clone(), join: bridge.join.take(), source: String::new(), monitor: false, sink: None }), error: None });
            (plain, high)
        });
        let _ = pactl(&["unload-module", &source_module]);
        let _ = pactl(&["unload-module", &module]);
        remove_devices();
        let (plain, high) = result.expect("o teste de ponta a ponta falhou");
        assert!((plain - 440.0).abs() < 25.0, "sem efeito: {plain:.0} Hz");
        assert!((high - 580.0).abs() < 45.0, "com efeito agudo: {high:.0} Hz");
    }
}
