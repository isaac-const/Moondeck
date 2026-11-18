//! Injeção de teclas no Windows e no macOS, pelo `enigo`.
//!
//! No macOS o sistema só deixa um app enviar teclas depois que o usuário o
//! autoriza em Ajustes do Sistema → Privacidade e Segurança → Acessibilidade.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};

use crate::keys::parse_combo;

/// Códigos evdev (os que `keys::keycode` conhece) para as teclas do `enigo`.
fn key_for(code: u16) -> Option<Key> {
    let letter = |c: char| Some(Key::Unicode(c));
    match code {
        1 => Some(Key::Escape),
        2..=10 => letter(char::from_digit(u32::from(code) - 1, 10)?),
        11 => letter('0'),
        12 => letter('-'),
        13 => letter('='),
        14 => Some(Key::Backspace),
        15 => Some(Key::Tab),
        16 => letter('q'),
        17 => letter('w'),
        18 => letter('e'),
        19 => letter('r'),
        20 => letter('t'),
        21 => letter('y'),
        22 => letter('u'),
        23 => letter('i'),
        24 => letter('o'),
        25 => letter('p'),
        26 => letter('['),
        27 => letter(']'),
        28 => Some(Key::Return),
        29 => Some(Key::Control),
        30 => letter('a'),
        31 => letter('s'),
        32 => letter('d'),
        33 => letter('f'),
        34 => letter('g'),
        35 => letter('h'),
        36 => letter('j'),
        37 => letter('k'),
        38 => letter('l'),
        39 => letter(';'),
        40 => letter('\''),
        41 => letter('`'),
        42 => Some(Key::Shift),
        43 => letter('\\'),
        44 => letter('z'),
        45 => letter('x'),
        46 => letter('c'),
        47 => letter('v'),
        48 => letter('b'),
        49 => letter('n'),
        50 => letter('m'),
        51 => letter(','),
        52 => letter('.'),
        53 => letter('/'),
        56 => Some(Key::Alt),
        57 => Some(Key::Space),
        59 => Some(Key::F1),
        60 => Some(Key::F2),
        61 => Some(Key::F3),
        62 => Some(Key::F4),
        63 => Some(Key::F5),
        64 => Some(Key::F6),
        65 => Some(Key::F7),
        66 => Some(Key::F8),
        67 => Some(Key::F9),
        68 => Some(Key::F10),
        87 => Some(Key::F11),
        88 => Some(Key::F12),
        102 => Some(Key::Home),
        103 => Some(Key::UpArrow),
        104 => Some(Key::PageUp),
        105 => Some(Key::LeftArrow),
        106 => Some(Key::RightArrow),
        107 => Some(Key::End),
        108 => Some(Key::DownArrow),
        109 => Some(Key::PageDown),
        111 => Some(Key::Delete),
        125 => Some(Key::Meta),
        _ => None,
    }
}

pub fn inject(combo: &str) -> Result<(), String> {
    let parsed = parse_combo(combo)?;
    let resolve = |code: u16| key_for(code).ok_or_else(|| format!("tecla sem equivalente neste sistema: {code}"));
    let modifiers = parsed.modifiers.iter().map(|code| resolve(*code)).collect::<Result<Vec<_>, _>>()?;
    let main = resolve(parsed.main)?;

    let mut enigo = Enigo::new(&Settings::default()).map_err(|error| {
        format!("não foi possível enviar teclas (no macOS, autorize o MoonDeck em Acessibilidade): {error}")
    })?;
    let fail = |error: enigo::InputError| format!("falha ao enviar a tecla: {error}");

    for key in &modifiers {
        enigo.key(*key, Direction::Press).map_err(fail)?;
    }
    let result = enigo.key(main, Direction::Click).map_err(fail);
    // Solta os modificadores mesmo se a tecla principal falhou: um Ctrl preso
    // atrapalha o resto do sistema.
    for key in modifiers.iter().rev() {
        let _ = enigo.key(*key, Direction::Release);
    }
    result
}
