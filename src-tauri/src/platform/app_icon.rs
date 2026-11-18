//! Ícone de um programa, para o botão que o abre.
//!
//! No Linux: acha o `.desktop` cujo `Exec` (ou nome) bate com o comando e
//! resolve o `Icon` nos temas instalados. Nos outros sistemas ainda não há
//! busca; o botão cai no ícone padrão.

use std::path::{Path, PathBuf};

/// Um ícone maior que isto vira dado demais para um botão de 28 px.
const MAX_ICON_BYTES: u64 = 1024 * 1024;

pub fn data_url(command: &str) -> Option<String> {
    let path = find(command)?;
    to_data_url(&path)
}

fn to_data_url(path: &Path) -> Option<String> {
    use base64::Engine;
    let mime = match path.extension()?.to_str()?.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        _ => return None,
    };
    if std::fs::metadata(path).ok()?.len() > MAX_ICON_BYTES {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[cfg(not(target_os = "linux"))]
fn find(_command: &str) -> Option<PathBuf> {
    None
}

#[cfg(target_os = "linux")]
fn find(command: &str) -> Option<PathBuf> {
    let wanted = Path::new(command.trim()).file_name()?.to_str()?.to_ascii_lowercase();
    if wanted.is_empty() {
        return None;
    }
    let icon = desktop_dirs()
        .into_iter()
        .filter_map(|dir| std::fs::read_dir(dir).ok())
        .flatten()
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "desktop"))
        .find_map(|entry| icon_name_if_matches(&entry.path(), &wanted))?;
    resolve_icon(&icon)
}

#[cfg(target_os = "linux")]
fn data_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(home) = &home {
        dirs.push(home.join(".local/share"));
    }
    let system = std::env::var("XDG_DATA_DIRS").unwrap_or_default();
    for dir in system.split(':').filter(|dir| !dir.is_empty()) {
        dirs.push(PathBuf::from(dir));
    }
    for fixed in ["/usr/local/share", "/usr/share", "/var/lib/flatpak/exports/share", "/var/lib/snapd/desktop"] {
        dirs.push(PathBuf::from(fixed));
    }
    if let Some(home) = &home {
        dirs.push(home.join(".local/share/flatpak/exports/share"));
    }
    dirs.dedup();
    dirs
}

#[cfg(target_os = "linux")]
pub(super) fn desktop_dirs() -> Vec<PathBuf> {
    data_dirs().into_iter().map(|dir| dir.join("applications")).collect()
}

/// `Some(Icon)` se este `.desktop` é do programa pedido.
#[cfg(target_os = "linux")]
fn icon_name_if_matches(path: &Path, wanted: &str) -> Option<String> {
    let text = std::fs::read_to_string(path).ok()?;
    let mut exec: Option<String> = None;
    let mut icon: Option<String> = None;
    let mut name: Option<String> = None;
    for line in text.lines() {
        if line.starts_with('[') && line != "[Desktop Entry]" {
            break; // ações extras não contam
        }
        if let Some(value) = line.strip_prefix("Exec=") {
            exec = Some(value.to_string());
        } else if let Some(value) = line.strip_prefix("Icon=") {
            icon = Some(value.trim().to_string());
        } else if let Some(value) = line.strip_prefix("Name=") {
            name = Some(value.to_string());
        }
    }
    let icon = icon.filter(|icon| !icon.is_empty())?;
    let stem = path.file_stem()?.to_str()?.to_ascii_lowercase();
    let exec_name = exec
        .as_deref()
        .and_then(|exec| exec.split_whitespace().find(|part| !part.contains('=') && *part != "env"))
        .and_then(|first| Path::new(first).file_name()?.to_str().map(str::to_ascii_lowercase));
    let hit = exec_name.as_deref() == Some(wanted)
        || stem == wanted
        || stem.ends_with(&format!(".{wanted}"))
        || name.is_some_and(|name| name.to_ascii_lowercase() == wanted);
    hit.then_some(icon)
}

#[cfg(target_os = "linux")]
fn resolve_icon(icon: &str) -> Option<PathBuf> {
    let direct = Path::new(icon);
    if direct.is_absolute() {
        return direct.is_file().then(|| direct.to_path_buf());
    }
    let sizes = ["256x256", "128x128", "96x96", "64x64", "48x48", "scalable", "512x512", "32x32"];
    let mut themes: Vec<PathBuf> = Vec::new();
    for base in data_dirs() {
        let icons = base.join("icons");
        let hicolor = icons.join("hicolor");
        if hicolor.is_dir() {
            themes.push(hicolor);
        }
        if let Ok(read) = std::fs::read_dir(&icons) {
            for theme in read.flatten() {
                let path = theme.path();
                if path.is_dir() && !themes.contains(&path) {
                    themes.push(path);
                }
            }
        }
    }
    for theme in &themes {
        for size in sizes {
            for ext in ["png", "svg"] {
                // Dois leiautes de tema: `256x256/apps` e `apps/256`.
                let layouts = [
                    theme.join(size).join("apps").join(format!("{icon}.{ext}")),
                    theme.join("apps").join(size.split('x').next().unwrap_or(size)).join(format!("{icon}.{ext}")),
                ];
                if let Some(found) = layouts.into_iter().find(|path| path.is_file()) {
                    return Some(found);
                }
            }
        }
    }
    for base in data_dirs() {
        for ext in ["png", "svg"] {
            let path = base.join("pixmaps").join(format!("{icon}.{ext}"));
            if path.is_file() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn reconhece_o_programa_pelo_exec() {
        let dir = std::env::temp_dir().join("moondeck-appicon-test");
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("org.exemplo.Foo.desktop");
        std::fs::write(&file, "[Desktop Entry]\nName=Foo\nExec=/usr/bin/foo --novo %U\nIcon=foo-icone\n").unwrap();
        assert_eq!(icon_name_if_matches(&file, "foo").as_deref(), Some("foo-icone"));
        assert_eq!(icon_name_if_matches(&file, "bar"), None);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
