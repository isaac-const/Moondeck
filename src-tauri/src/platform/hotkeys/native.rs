//! Captura global de teclas no Windows e no macOS.
//!
//! O plugin `global-shortcut` registra as teclas no sistema e avisa quando são
//! apertadas e soltas. Os nomes das teclas do deck seguem o padrão XKB
//! (`Page_Up`, `F13`, `CTRL+Home`); aqui viram `Shortcut`.

use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use super::{Activation, BindResult, Binding, HotkeyRequest};

pub struct BoundSession {
    app: AppHandle,
    shortcuts: Vec<Shortcut>,
}

impl BoundSession {
    pub async fn close(self) {
        let manager = self.app.global_shortcut();
        for shortcut in self.shortcuts {
            if let Err(error) = manager.unregister(shortcut) {
                log::warn!("não foi possível soltar uma tecla: {error}");
            }
        }
    }
}

fn code_for(name: &str) -> Option<Code> {
    let lower = name.to_ascii_lowercase();
    let mapped = match lower.as_str() {
        "page_up" | "pageup" | "prior" => "PageUp",
        "page_down" | "pagedown" | "next" => "PageDown",
        "home" => "Home",
        "end" => "End",
        "insert" => "Insert",
        "delete" => "Delete",
        "up" => "ArrowUp",
        "down" => "ArrowDown",
        "left" => "ArrowLeft",
        "right" => "ArrowRight",
        "return" | "enter" => "Enter",
        "escape" | "esc" => "Escape",
        "backspace" => "Backspace",
        "tab" => "Tab",
        "space" => "Space",
        "print" => "PrintScreen",
        "scroll_lock" => "ScrollLock",
        "pause" => "Pause",
        "num_lock" => "NumLock",
        "grave" => "Backquote",
        "minus" => "Minus",
        "equal" => "Equal",
        "comma" => "Comma",
        "period" => "Period",
        "slash" => "Slash",
        "semicolon" => "Semicolon",
        "apostrophe" => "Quote",
        "backslash" => "Backslash",
        "bracketleft" => "BracketLeft",
        "bracketright" => "BracketRight",
        "kp_add" => "NumpadAdd",
        "kp_subtract" => "NumpadSubtract",
        "kp_multiply" => "NumpadMultiply",
        "kp_divide" => "NumpadDivide",
        "kp_decimal" => "NumpadDecimal",
        "kp_enter" => "NumpadEnter",
        other => {
            if let Some(digit) = other.strip_prefix("kp_").filter(|d| d.len() == 1 && d.as_bytes()[0].is_ascii_digit()) {
                return format!("Numpad{digit}").parse().ok();
            }
            if other.len() == 1 {
                let c = other.as_bytes()[0];
                if c.is_ascii_alphabetic() {
                    return format!("Key{}", other.to_ascii_uppercase()).parse().ok();
                }
                if c.is_ascii_digit() {
                    return format!("Digit{other}").parse().ok();
                }
            }
            // F1…F24 já têm o mesmo nome nos dois mundos.
            if other.starts_with('f') && other[1..].chars().all(|c| c.is_ascii_digit()) && other.len() > 1 {
                return other.to_ascii_uppercase().parse().ok();
            }
            return None;
        }
    };
    mapped.parse().ok()
}

fn parse_trigger(trigger: &str) -> Result<Shortcut, String> {
    let mut modifiers = Modifiers::empty();
    let mut main = None;
    for part in trigger.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_ascii_uppercase().as_str() {
            "CTRL" | "CONTROL" => modifiers |= Modifiers::CONTROL,
            "ALT" => modifiers |= Modifiers::ALT,
            "SHIFT" => modifiers |= Modifiers::SHIFT,
            "LOGO" | "SUPER" | "META" => modifiers |= Modifiers::SUPER,
            _ => main = Some(code_for(part).ok_or_else(|| format!("tecla sem equivalente neste sistema: {part}"))?),
        }
    }
    let code = main.ok_or_else(|| format!("tecla vazia: {trigger}"))?;
    Ok(Shortcut::new(if modifiers.is_empty() { None } else { Some(modifiers) }, code))
}

pub async fn bind_with(
    app: &AppHandle,
    requests: Vec<HotkeyRequest>,
    on_activated: impl Fn(Activation) + Send + Sync + 'static,
) -> Result<(BindResult, BoundSession), String> {
    if requests.is_empty() {
        return Err("nenhuma tecla para registrar".to_string());
    }
    let manager = app.global_shortcut();
    // Segurar uma tecla pode repetir o "apertou" (o sistema repete a tecla). Se o
    // sistema também avisa quando ela é solta, repetições são ignoradas: segurar
    // não pode trocar de modo sem parar nem impedir o "segurar para o modo Off".
    let down: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let releases = Arc::new(AtomicBool::new(false));
    let on_activated = Arc::new(on_activated);
    let mut bindings = Vec::new();
    let mut shortcuts = Vec::new();
    let mut failures = Vec::new();

    for request in &requests {
        let shortcut = match parse_trigger(&request.trigger) {
            Ok(shortcut) => shortcut,
            Err(error) => {
                failures.push(error);
                continue;
            }
        };
        let id = request.id.clone();
        let handler = Arc::clone(&on_activated);
        let (down, releases) = (Arc::clone(&down), Arc::clone(&releases));
        let result = manager.on_shortcut(shortcut, move |_app, _shortcut, event| {
            let pressed = event.state == ShortcutState::Pressed;
            if let Ok(mut down) = down.lock() {
                if pressed {
                    if !down.insert(id.clone()) && releases.load(Ordering::Relaxed) {
                        return;
                    }
                } else {
                    releases.store(true, Ordering::Relaxed);
                    down.remove(&id);
                }
            }
            handler(Activation { id: id.clone(), pressed });
        });
        match result {
            Ok(()) => {
                shortcuts.push(shortcut);
                bindings.push(Binding {
                    id: request.id.clone(),
                    description: request.description.clone(),
                    trigger: request.trigger.clone(),
                });
            }
            Err(error) => failures.push(format!("{}: {error}", request.trigger)),
        }
    }

    let session = BoundSession { app: app.clone(), shortcuts };
    if bindings.is_empty() {
        session.close().await;
        return Err(format!("o sistema recusou as teclas ({})", failures.join("; ")));
    }
    for failure in failures {
        log::warn!("tecla não registrada: {failure}");
    }
    Ok((BindResult { bindings }, session))
}
