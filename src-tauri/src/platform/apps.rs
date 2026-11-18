//! Programas instalados: para o usuário escolher em vez de adivinhar o nome do
//! executável (`modrinth-app`, não "Modrinth App").
//!
//! Linux: lê os `.desktop`. Nos outros sistemas ainda não há busca.

use serde::Serialize;
use specta::Type;

#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    /// Executável, sem os códigos de campo do `Exec` (`%u`, `%F`…).
    pub command: String,
    pub args: Vec<String>,
}

#[cfg(target_os = "linux")]
/// Divide uma linha `Exec=` como o shell, descartando `%u`, `%F` e afins.
pub fn split_exec(exec: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;
    let mut chars = exec.chars().peekable();
    while let Some(c) = chars.next() {
        match (quote, c) {
            (Some(q), c) if c == q => quote = None,
            (Some(_), '\\') => {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            }
            (Some(_), c) => current.push(c),
            (None, '"' | '\'') => {
                quote = Some(c);
                started = true;
            }
            (None, c) if c.is_whitespace() => {
                if started || !current.is_empty() {
                    parts.push(std::mem::take(&mut current));
                    started = false;
                }
            }
            (None, c) => current.push(c),
        }
    }
    if started || !current.is_empty() {
        parts.push(current);
    }
    parts
        .into_iter()
        .filter_map(|part| {
            let cleaned = part.replace("%%", "\u{0}");
            let is_code = cleaned.len() == 2 && cleaned.starts_with('%');
            (!is_code).then(|| cleaned.replace('\u{0}', "%"))
        })
        .collect()
}

#[cfg(target_os = "linux")]
pub fn list() -> Vec<InstalledApp> {
    use std::collections::HashSet;
    let mut seen: HashSet<String> = HashSet::new();
    let mut apps: Vec<InstalledApp> = Vec::new();
    for dir in super::app_icon::desktop_dirs() {
        let Ok(read) = std::fs::read_dir(dir) else { continue };
        for entry in read.flatten() {
            let path = entry.path();
            if path.extension().is_none_or(|ext| ext != "desktop") {
                continue;
            }
            let Some(app) = parse(&path) else { continue };
            if seen.insert(app.name.to_lowercase()) {
                apps.push(app);
            }
        }
    }
    apps.sort_by_key(|app| app.name.to_lowercase());
    apps
}

#[cfg(not(target_os = "linux"))]
pub fn list() -> Vec<InstalledApp> {
    Vec::new()
}

#[cfg(target_os = "linux")]
fn parse(path: &std::path::Path) -> Option<InstalledApp> {
    let text = std::fs::read_to_string(path).ok()?;
    let (mut name, mut exec, mut hidden, mut kind) = (None, None, false, String::from("Application"));
    for line in text.lines() {
        if line.starts_with('[') && line != "[Desktop Entry]" {
            break;
        }
        if let Some(v) = line.strip_prefix("Name=") {
            name = Some(v.to_string());
        } else if let Some(v) = line.strip_prefix("Exec=") {
            exec = Some(v.to_string());
        } else if line == "NoDisplay=true" || line == "Hidden=true" {
            hidden = true;
        } else if let Some(v) = line.strip_prefix("Type=") {
            kind = v.to_string();
        }
    }
    if hidden || kind != "Application" {
        return None;
    }
    let mut parts = split_exec(&exec?);
    if parts.is_empty() {
        return None;
    }
    let command = parts.remove(0);
    Some(InstalledApp { name: name?, command, args: parts })
}

#[cfg(target_os = "linux")]
/// O programa instalado cujo nome (ou executável) bate com o texto digitado:
/// "modrinth app", "Modrinth-App", "discord"…
pub fn find_by_name(wanted: &str) -> Option<InstalledApp> {
    let norm = |text: &str| -> String {
        text.to_lowercase().chars().filter(|c| c.is_alphanumeric()).collect()
    };
    let target = norm(wanted);
    if target.is_empty() {
        return None;
    }
    list().into_iter().find(|app| {
        norm(&app.name) == target
            || std::path::Path::new(&app.command)
                .file_name()
                .and_then(|f| f.to_str())
                .is_some_and(|f| norm(f) == target)
    })
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn exec_perde_codigos_de_campo_e_respeita_aspas() {
        assert_eq!(split_exec("/usr/bin/discord --url -- %u"), ["/usr/bin/discord", "--url", "--"]);
        assert_eq!(
            split_exec("env A=1 \"/opt/Meu App/run\" --x %F"),
            ["env", "A=1", "/opt/Meu App/run", "--x"]
        );
        assert_eq!(split_exec("app 100%%"), ["app", "100%"]);
    }
}
