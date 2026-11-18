//! Som do soundboard: decodifica (mp3, wav, ogg, flac, aac/m4a…), aplica as
//! edições da ação (corte, fade, ganho) e entrega o resultado a `playback`.
//!
//! O mesmo caminho serve a tecla e a prévia da tela de edição, então o que se
//! ouve ao editar é exatamente o que toca ao apertar a tecla.
//!
//! O resultado de `decode` fica em cache (por arquivo, tamanho e data): a
//! primeira tecla não paga a decodificação, porque o motor aquece os sons da
//! config assim que ela carrega.

use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::SystemTime,
};

use serde::{Deserialize, Serialize};
use specta::Type;
use symphonia::core::{
    audio::SampleBuffer,
    codecs::DecoderOptions,
    errors::Error as SymphoniaError,
    formats::FormatOptions,
    io::MediaSourceStream,
    meta::MetadataOptions,
    probe::Hint,
};

/// Acima disso o arquivo não é "um som de soundboard" e a memória não vale a pena.
const MAX_DECODED_SECONDS: u64 = 10 * 60;
const CACHE_LIMIT: usize = 12;
/// Rampa mínima nas pontas: cortar no meio da onda sem ela estala.
const GUARD_FADE_MS: u32 = 3;

pub struct DecodedAudio {
    pub sample_rate: u32,
    pub channels: u16,
    /// Intercalado (L R L R…), em -1.0..1.0.
    pub samples: Vec<f32>,
}

impl DecodedAudio {
    pub fn frames(&self) -> usize {
        self.samples.len() / usize::from(self.channels.max(1))
    }

    pub fn duration_ms(&self) -> u32 {
        (self.frames() as u64 * 1000 / u64::from(self.sample_rate.max(1))) as u32
    }
}

/// As edições de uma ação de som.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SoundEdit {
    /// 0–200 (%). Acima de 100 reforça sons baixos; o resultado é limitado.
    pub volume: u16,
    pub start_ms: u32,
    /// 0 = até o fim.
    pub end_ms: u32,
    pub fade_in_ms: u32,
    pub fade_out_ms: u32,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PeaksReport {
    pub duration_ms: u32,
    pub sample_rate: u32,
    pub channels: u16,
    /// Pico (0–1) de cada fatia igual da duração, para desenhar a forma de onda.
    pub peaks: Vec<f32>,
}

type CacheKey = (PathBuf, u64, Option<SystemTime>);
static CACHE: Mutex<Vec<(CacheKey, Arc<DecodedAudio>)>> = Mutex::new(Vec::new());

fn cache_key(path: &Path) -> Result<CacheKey, String> {
    let meta = std::fs::metadata(path)
        .map_err(|error| format!("não foi possível abrir {}: {error}", path.display()))?;
    Ok((path.to_path_buf(), meta.len(), meta.modified().ok()))
}

pub fn decode(path: &Path) -> Result<Arc<DecodedAudio>, String> {
    let key = cache_key(path)?;
    if let Ok(cache) = CACHE.lock() {
        if let Some((_, hit)) = cache.iter().find(|(known, _)| *known == key) {
            return Ok(hit.clone());
        }
    }

    let decoded = Arc::new(decode_uncached(path)?);
    if let Ok(mut cache) = CACHE.lock() {
        cache.retain(|(known, _)| known.0 != key.0);
        cache.push((key, decoded.clone()));
        if cache.len() > CACHE_LIMIT {
            cache.remove(0);
        }
    }
    Ok(decoded)
}

fn decode_uncached(path: &Path) -> Result<DecodedAudio, String> {
    let file = File::open(path)
        .map_err(|error| format!("não foi possível abrir {}: {error}", path.display()))?;
    let stream = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(extension);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, stream, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|error| format!("formato de áudio não reconhecido: {error}"))?;
    let mut format = probed.format;

    let track = format
        .default_track()
        .ok_or_else(|| "o arquivo não tem faixa de áudio".to_string())?;
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| format!("codec não suportado: {error}"))?;

    let mut sample_rate = track.codec_params.sample_rate.unwrap_or(0);
    let mut channels: u16 = track
        .codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(0);
    let mut samples: Vec<f32> = Vec::new();
    let mut buffer: Option<SampleBuffer<f32>> = None;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::ResetRequired) => break,
            Err(error) => return Err(format!("falha ao ler o áudio: {error}")),
        };
        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                sample_rate = spec.rate;
                channels = spec.channels.count() as u16;
                let capacity = decoded.capacity() as u64;
                let buf = buffer.get_or_insert_with(|| SampleBuffer::<f32>::new(capacity, spec));
                if buf.capacity() < decoded.capacity() * usize::from(channels) {
                    *buf = SampleBuffer::<f32>::new(capacity, spec);
                }
                buf.copy_interleaved_ref(decoded);
                samples.extend_from_slice(buf.samples());

                let frames = samples.len() as u64 / u64::from(channels.max(1));
                if sample_rate > 0 && frames / u64::from(sample_rate) > MAX_DECODED_SECONDS {
                    return Err("o som passa de 10 minutos".to_string());
                }
            }
            // Um pacote ruim não derruba o som inteiro.
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(error) => return Err(format!("falha ao decodificar: {error}")),
        }
    }

    if samples.is_empty() || sample_rate == 0 || channels == 0 {
        return Err("o arquivo não tem áudio".to_string());
    }
    Ok(DecodedAudio {
        sample_rate,
        channels,
        samples,
    })
}

/// Pré-decodifica em segundo plano. Erros ficam para o momento de tocar.
pub fn prewarm(files: Vec<PathBuf>) {
    std::thread::spawn(move || {
        for file in files {
            let _ = decode(&file);
        }
    });
}

pub fn peaks(path: &Path, buckets: usize) -> Result<PeaksReport, String> {
    let audio = decode(path)?;
    let buckets = buckets.clamp(16, 2048);
    let channels = usize::from(audio.channels);
    let frames = audio.frames();
    let mut peaks = vec![0f32; buckets];

    for (index, peak) in peaks.iter_mut().enumerate() {
        let from = index * frames / buckets;
        let to = ((index + 1) * frames / buckets).max(from + 1).min(frames);
        let mut max = 0f32;
        for frame in from..to {
            for channel in 0..channels {
                max = max.max(audio.samples[frame * channels + channel].abs());
            }
        }
        *peak = max.min(1.0);
    }

    Ok(PeaksReport {
        duration_ms: audio.duration_ms(),
        sample_rate: audio.sample_rate,
        channels: audio.channels,
        peaks,
    })
}

/// Aplica corte, fade e ganho e devolve um WAV de 16 bits, pronto para o player.
pub fn render_wav(audio: &DecodedAudio, edit: &SoundEdit, master: u8) -> Result<Vec<u8>, String> {
    // Mais de 2 canais vira estéreo: o PipeWire espera um layout que conheça.
    let source_channels = usize::from(audio.channels);
    let out_channels = source_channels.min(2);
    let rate = u64::from(audio.sample_rate);
    let frames = audio.frames();

    let start = ((u64::from(edit.start_ms) * rate / 1000) as usize).min(frames);
    let end = if edit.end_ms == 0 {
        frames
    } else {
        ((u64::from(edit.end_ms) * rate / 1000) as usize).min(frames)
    };
    if end <= start {
        return Err("o trecho escolhido está vazio".to_string());
    }
    let length = end - start;

    let fade_in = ((u64::from(edit.fade_in_ms.max(GUARD_FADE_MS)) * rate / 1000) as usize).min(length / 2);
    let fade_out = ((u64::from(edit.fade_out_ms.max(GUARD_FADE_MS)) * rate / 1000) as usize).min(length / 2);
    let gain = (f32::from(edit.volume) / 100.0) * (f32::from(master) / 100.0);

    let mut pcm: Vec<u8> = Vec::with_capacity(length * out_channels * 2);
    for offset in 0..length {
        let mut envelope = 1.0f32;
        if offset < fade_in {
            envelope = offset as f32 / fade_in as f32;
        }
        if offset >= length - fade_out {
            envelope = envelope.min((length - offset) as f32 / fade_out as f32);
        }
        for channel in 0..out_channels {
            let sample = audio.samples[(start + offset) * source_channels + channel];
            let value = (sample * gain * envelope).clamp(-1.0, 1.0);
            pcm.extend_from_slice(&((value * f32::from(i16::MAX)) as i16).to_le_bytes());
        }
    }

    let data_len = pcm.len() as u32;
    let block = (out_channels * 2) as u16;
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes());
    wav.extend_from_slice(&(out_channels as u16).to_le_bytes());
    wav.extend_from_slice(&audio.sample_rate.to_le_bytes());
    wav.extend_from_slice(&(audio.sample_rate * u32::from(block)).to_le_bytes());
    wav.extend_from_slice(&block.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(&pcm);
    Ok(wav)
}

pub use super::playback::{keep_awake, stop_all};

/// Bipe de 180 ms (880 Hz) em WAV, para testar a saída.
pub fn test_tone() -> Vec<u8> {
    const RATE: u32 = 48_000;
    let samples = (RATE as usize * 180) / 1_000;
    let mut data = Vec::with_capacity(samples * 2);
    for n in 0..samples {
        let t = n as f32 / RATE as f32;
        // Entra e sai suave: um bipe seco estala.
        let envelope = (n.min(samples - n) as f32 / 480.0).min(1.0);
        let value = (t * 880.0 * std::f32::consts::TAU).sin() * 0.35 * envelope;
        data.extend_from_slice(&((value * f32::from(i16::MAX)) as i16).to_le_bytes());
    }
    let mut wav = Vec::with_capacity(44 + data.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&RATE.to_le_bytes());
    wav.extend_from_slice(&(RATE * 2).to_le_bytes());
    wav.extend_from_slice(&2u16.to_le_bytes());
    wav.extend_from_slice(&16u16.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(data.len() as u32).to_le_bytes());
    wav.extend_from_slice(&data);
    wav
}

/// Duração do WAV que `render_wav` produz (cabeçalho de 44 bytes).
fn wav_duration_ms(wav: &[u8]) -> u32 {
    if wav.len() < 44 {
        return 0;
    }
    let byte_rate = u32::from_le_bytes([wav[28], wav[29], wav[30], wav[31]]).max(1);
    let data = u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]);
    (u64::from(data) * 1_000 / u64::from(byte_rate)) as u32
}

/// Toca o arquivo com as edições. Volta assim que o player começou e devolve
/// a duração do trecho (para a interface animar o progresso). Com o microfone
/// virtual ligado, o som toca também nele.
pub fn play(
    path: &Path,
    edit: &SoundEdit,
    master: u8,
    sink: Option<&str>,
    stop_others: bool,
) -> Result<u32, String> {
    let audio = decode(path)?;
    let wav = render_wav(&audio, edit, master)?;
    let duration_ms = wav_duration_ms(&wav);

    super::playback::play_wav(wav, sink, stop_others)?;
    Ok(duration_ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(rate: u32, channels: u16, seconds: f32) -> DecodedAudio {
        let frames = (rate as f32 * seconds) as usize;
        let mut samples = Vec::with_capacity(frames * usize::from(channels));
        for frame in 0..frames {
            let value = (frame as f32 / rate as f32 * 440.0 * std::f32::consts::TAU).sin() * 0.5;
            for _ in 0..channels {
                samples.push(value);
            }
        }
        DecodedAudio {
            sample_rate: rate,
            channels,
            samples,
        }
    }

    fn edit() -> SoundEdit {
        SoundEdit {
            volume: 100,
            start_ms: 0,
            end_ms: 0,
            fade_in_ms: 0,
            fade_out_ms: 0,
        }
    }

    fn data_len(wav: &[u8]) -> usize {
        u32::from_le_bytes([wav[40], wav[41], wav[42], wav[43]]) as usize
    }

    #[test]
    fn corte_reduz_a_duracao() {
        let audio = tone(48_000, 2, 2.0);
        let full = render_wav(&audio, &edit(), 100).expect("wav");
        let cut = render_wav(
            &audio,
            &SoundEdit {
                start_ms: 500,
                end_ms: 1_000,
                ..edit()
            },
            100,
        )
        .expect("wav");
        // 0,5 s de 48 kHz estéreo 16 bits.
        assert_eq!(data_len(&cut), 24_000 * 4);
        assert_eq!(data_len(&full), 96_000 * 4);
    }

    #[test]
    fn trecho_vazio_e_recusado() {
        let audio = tone(48_000, 1, 1.0);
        let result = render_wav(
            &audio,
            &SoundEdit {
                start_ms: 800,
                end_ms: 400,
                ..edit()
            },
            100,
        );
        assert!(result.is_err());
    }

    #[test]
    fn fade_in_comeca_no_silencio_e_ganho_e_limitado() {
        let audio = tone(48_000, 1, 1.0);
        let wav = render_wav(
            &audio,
            &SoundEdit {
                volume: 200,
                fade_in_ms: 100,
                ..edit()
            },
            100,
        )
        .expect("wav");
        let first = i16::from_le_bytes([wav[44], wav[45]]);
        assert_eq!(first, 0, "fade-in começa em zero");
        let peak = wav[44..]
            .chunks_exact(2)
            .map(|b| i16::from_le_bytes([b[0], b[1]]).unsigned_abs())
            .max()
            .unwrap_or(0);
        assert!(peak <= i16::MAX as u16, "nunca estoura");
    }

    #[test]
    fn mais_de_dois_canais_vira_estereo() {
        let audio = tone(44_100, 6, 0.1);
        let wav = render_wav(&audio, &edit(), 100).expect("wav");
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 2);
    }

    /// Aponte `MOONDECK_TEST_AUDIO` para um mp3/ogg/flac real para exercitar o
    /// decodificador de verdade; sem a variável, o teste não faz nada.
    #[test]
    fn decodifica_arquivo_real_se_fornecido() {
        let Ok(path) = std::env::var("MOONDECK_TEST_AUDIO") else {
            return;
        };
        let started = std::time::Instant::now();
        let audio = decode(Path::new(&path)).expect("decodificar");
        eprintln!(
            "decodificado: {} Hz, {} canais, {} ms, em {:?}",
            audio.sample_rate,
            audio.channels,
            audio.duration_ms(),
            started.elapsed()
        );
        assert!(audio.duration_ms() > 100);
        let wav = render_wav(&audio, &edit(), 100).expect("wav");
        assert!(wav.len() > 44);
    }

    #[test]
    fn picos_ficam_entre_zero_e_um() {
        // Escreve um WAV real e passa pelo decodificador de verdade.
        let audio = tone(22_050, 1, 0.5);
        let wav = render_wav(&audio, &edit(), 100).expect("wav");
        let path = std::env::temp_dir().join(format!("moondeck-peaks-{}.wav", std::process::id()));
        std::fs::write(&path, wav).expect("gravar wav");
        let report = peaks(&path, 64).expect("picos");
        std::fs::remove_file(&path).ok();
        assert_eq!(report.peaks.len(), 64);
        assert!((report.duration_ms as i32 - 500).abs() < 20);
        assert!(report.peaks.iter().all(|p| (0.0..=1.0).contains(p)));
        assert!(report.peaks.iter().any(|p| *p > 0.3));
    }
}
