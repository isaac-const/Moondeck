//! Teclas: nome → keycode evdev → sequência de injeção.
//!
//! Fica fora de `platform` porque a config também valida combinações: um
//! atalho inválido precisa ser recusado na hora de salvar, não na hora de
//! disparar.

/// Um `ctrl+shift+m` já resolvido em keycodes evdev.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Combo {
    /// Modificadores na ordem canônica de pressionamento.
    pub modifiers: Vec<u16>,
    pub main: u16,
}

impl Combo {
    /// Tokens no formato que o `ydotool key` entende: `29:1 50:1 50:0 29:0`.
    pub fn keycodes(&self) -> Vec<String> {
        let mut tokens = Vec::with_capacity(self.modifiers.len() * 2 + 2);
        for code in &self.modifiers {
            tokens.push(format!("{code}:1"));
        }
        tokens.push(format!("{}:1", self.main));
        tokens.push(format!("{}:0", self.main));
        for code in self.modifiers.iter().rev() {
            tokens.push(format!("{code}:0"));
        }
        tokens
    }

}

/// Mapa de nomes para keycodes evdev. O ydotool usa códigos crus porque não
/// tem como conhecer todo layout do mundo; aqui cobrimos o que o deck usa.
pub fn keycode(name: &str) -> Option<u16> {
    match name {
        "esc" | "escape" => Some(1),
        "1" => Some(2),
        "2" => Some(3),
        "3" => Some(4),
        "4" => Some(5),
        "5" => Some(6),
        "6" => Some(7),
        "7" => Some(8),
        "8" => Some(9),
        "9" => Some(10),
        "0" => Some(11),
        "minus" | "-" => Some(12),
        "equal" | "=" => Some(13),
        "backspace" => Some(14),
        "tab" => Some(15),
        "q" => Some(16),
        "w" => Some(17),
        "e" => Some(18),
        "r" => Some(19),
        "t" => Some(20),
        "y" => Some(21),
        "u" => Some(22),
        "i" => Some(23),
        "o" => Some(24),
        "p" => Some(25),
        "bracketleft" | "[" => Some(26),
        "bracketright" | "]" => Some(27),
        "enter" | "return" => Some(28),
        "a" => Some(30),
        "s" => Some(31),
        "d" => Some(32),
        "f" => Some(33),
        "g" => Some(34),
        "h" => Some(35),
        "j" => Some(36),
        "k" => Some(37),
        "l" => Some(38),
        "semicolon" | ";" => Some(39),
        "apostrophe" | "'" => Some(40),
        "grave" | "`" => Some(41),
        "backslash" | "\\" => Some(43),
        "z" => Some(44),
        "x" => Some(45),
        "c" => Some(46),
        "v" => Some(47),
        "b" => Some(48),
        "n" => Some(49),
        "m" => Some(50),
        "comma" | "," => Some(51),
        "period" | "." => Some(52),
        "slash" | "/" => Some(53),
        "space" => Some(57),
        "f1" => Some(59),
        "f2" => Some(60),
        "f3" => Some(61),
        "f4" => Some(62),
        "f5" => Some(63),
        "f6" => Some(64),
        "f7" => Some(65),
        "f8" => Some(66),
        "f9" => Some(67),
        "f10" => Some(68),
        "f11" => Some(87),
        "f12" => Some(88),
        "home" => Some(102),
        "up" => Some(103),
        "pageup" | "pgup" => Some(104),
        "left" => Some(105),
        "right" => Some(106),
        "end" => Some(107),
        "down" => Some(108),
        "pagedown" | "pgdn" => Some(109),
        "insert" | "ins" => Some(110),
        "delete" | "del" => Some(111),
        other => other.parse::<u16>().ok().filter(|code| *code > 0 && *code < 768),
    }
}

pub fn modifier(name: &str) -> Option<u16> {
    match name {
        "ctrl" | "control" => Some(29),
        "shift" => Some(42),
        "alt" | "option" => Some(56),
        "meta" | "super" | "win" | "logo" => Some(125),
        _ => None,
    }
}

/// Converte `ctrl+shift+m` em keycodes. A ordem canônica dos modificadores
/// mantém o resultado estável entre execuções.
pub fn parse_combo(combo: &str) -> Result<Combo, String> {
    let parts: Vec<String> = combo
        .split('+')
        .map(|part| part.trim().to_ascii_lowercase())
        .filter(|part| !part.is_empty())
        .collect();

    let Some((main, modifiers)) = parts.split_last() else {
        return Err("combinação vazia".to_string());
    };

    if modifiers.len() > 4 {
        return Err("modificadores demais na combinação".to_string());
    }

    let mut resolved: Vec<u16> = Vec::new();
    for name in modifiers {
        let Some(code) = modifier(name) else {
            return Err(format!("modificador desconhecido: {name}"));
        };
        if !resolved.contains(&code) {
            resolved.push(code);
        }
    }

    resolved.sort_unstable_by_key(|code| match *code {
        29 => 0,
        42 => 1,
        56 => 2,
        _ => 3,
    });

    let Some(main_code) = keycode(main) else {
        return Err(format!("tecla desconhecida: {main}"));
    };

    if modifier(main).is_some() {
        return Err("a última tecla precisa ser uma tecla comum".to_string());
    }

    Ok(Combo {
        modifiers: resolved,
        main: main_code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combo_simples_vira_keycodes() {
        let combo = parse_combo("ctrl+shift+m").expect("combinação válida");
        assert_eq!(combo.modifiers, vec![29, 42]);
        assert_eq!(combo.main, 50);
        assert_eq!(
            combo.keycodes(),
            vec!["29:1", "42:1", "50:1", "50:0", "42:0", "29:0"]
        );
    }

    #[test]
    fn combo_sem_modificador_funciona() {
        let combo = parse_combo("Home").expect("tecla sozinha");
        assert!(combo.modifiers.is_empty());
        assert_eq!(combo.main, 102);
    }

    #[test]
    fn combos_invalidas_sao_recusadas() {
        assert!(parse_combo("").is_err());
        assert!(parse_combo("ctrl+nada").is_err());
        assert!(parse_combo("ctrl+shift").is_err());
    }

}
