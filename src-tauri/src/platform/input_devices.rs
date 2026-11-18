//! Teclados e macropads conectados. No Linux lê o que o kernel anuncia; nos
//! outros sistemas não há leitura equivalente sem permissões extras, então a
//! lista vem vazia e a interface não mostra nada.

use serde::Serialize;
use specta::Type;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InputDevice {
    pub name: String,
    /// Parece um macropad: nome conhecido ou poucas teclas.
    pub macropad: bool,
}

/// Nomes que identificam macropads e controladoras de teclas programáveis.
#[cfg(target_os = "linux")]
const MACROPAD_HINTS: [&str; 10] = [
    "macropad", "macro pad", "stream deck", "streamdeck", "keypad", "numpad", "vial", "qmk", "via ", "deck",
];

/// Interfaces auxiliares de teclados e outros aparelhos, que não são teclados.
#[cfg(target_os = "linux")]
const IGNORED: [&str; 12] = [
    "consumer control",
    "system control",
    "mouse",
    "touchpad",
    "headset",
    "headphone",
    "power button",
    "sleep button",
    "video bus",
    "lid switch",
    "webcam",
    "wmi",
];

#[cfg(target_os = "linux")]
fn classify(name: &str, keys: u32) -> Option<bool> {
    let lower = name.to_lowercase();
    if IGNORED.iter().any(|word| lower.contains(word)) {
        return None;
    }
    let hinted = MACROPAD_HINTS.iter().any(|hint| lower.contains(hint));
    Some(hinted || keys < 30)
}

#[cfg(target_os = "linux")]
pub fn list() -> Vec<InputDevice> {
    let Ok(text) = std::fs::read_to_string("/proc/bus/input/devices") else {
        return Vec::new();
    };
    let mut out: Vec<InputDevice> = Vec::new();
    for block in text.split("\n\n") {
        let (mut name, mut is_kbd, mut keys) = (None, false, None);
        for line in block.lines() {
            if let Some(rest) = line.strip_prefix("N: Name=") {
                name = Some(rest.trim().trim_matches('"').to_string());
            } else if let Some(rest) = line.strip_prefix("H: Handlers=") {
                is_kbd = rest.split_whitespace().any(|handler| handler == "kbd");
            } else if let Some(rest) = line.strip_prefix("B: KEY=") {
                keys = Some(rest.split_whitespace().filter_map(|w| u64::from_str_radix(w, 16).ok()).map(|w| w.count_ones()).sum::<u32>());
            }
        }
        let (Some(name), Some(keys)) = (name, keys) else { continue };
        // O teclado do notebook e de mesa tem dezenas de teclas; sem "kbd" não é teclado.
        if !is_kbd || keys == 0 {
            continue;
        }
        if let Some(macropad) = classify(&name, keys) {
            if !out.iter().any(|device| device.name == name) {
                out.push(InputDevice { name, macropad });
            }
        }
    }
    out
}

#[cfg(not(target_os = "linux"))]
pub fn list() -> Vec<InputDevice> {
    Vec::new()
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn reconhece_macropad_pelo_nome_ou_pelo_tamanho() {
        assert_eq!(classify("Generic Macropad", 120), Some(true));
        assert_eq!(classify("Pequeno 12 teclas", 14), Some(true));
        assert_eq!(classify("AT Translated Set 2 keyboard", 110), Some(false));
    }

    #[test]
    fn ignora_interfaces_auxiliares() {
        assert_eq!(classify("Logitech USB Receiver Consumer Control", 40), None);
        assert_eq!(classify("Power Button", 1), None);
    }
}
