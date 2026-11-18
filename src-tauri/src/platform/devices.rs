//! Dispositivos de áudio para a tela de Áudio e o teste de saída.

use serde::Serialize;
use specta::Type;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SinkInfo {
    pub name: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub name: String,
    pub description: String,
    /// Fontes que são o "monitor" de uma saída não são microfones.
    pub monitor_of_sink: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevices {
    pub sinks: Vec<SinkInfo>,
    pub sources: Vec<SourceInfo>,
}

#[cfg(target_os = "linux")]
pub fn list() -> AudioDevices {
    fn pactl(kind: &str) -> Vec<serde_json::Value> {
        std::process::Command::new("pactl")
            .args(["-f", "json", "list", kind])
            .output()
            .ok()
            .filter(|output| output.status.success())
            .and_then(|output| serde_json::from_slice(&output.stdout).ok())
            .unwrap_or_default()
    }
    fn text(value: &serde_json::Value, key: &str) -> String {
        value.get(key).and_then(|v| v.as_str()).unwrap_or_default().to_string()
    }

    AudioDevices {
        sinks: pactl("sinks")
            .iter()
            .map(|sink| SinkInfo { name: text(sink, "name"), description: text(sink, "description") })
            .filter(|sink| !sink.name.is_empty())
            .collect(),
        sources: pactl("sources")
            .iter()
            .map(|source| SourceInfo {
                name: text(source, "name"),
                description: text(source, "description"),
                monitor_of_sink: source
                    .get("monitor_of_sink")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
            })
            .filter(|source| !source.name.is_empty())
            .collect(),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn list() -> AudioDevices {
    AudioDevices {
        sinks: super::playback::output_names()
            .into_iter()
            .map(|name| SinkInfo { description: name.clone(), name })
            .collect(),
        // O microfone virtual só existe no Linux.
        sources: Vec::new(),
    }
}
