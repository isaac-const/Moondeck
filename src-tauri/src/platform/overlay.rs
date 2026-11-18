//! Janela do HUD, a camada que mostra o modo ativo e as ações.
//!
//! No Wayland não existe posicionamento de toplevel: a janela cobre o monitor e
//! o deck é arrastado por dentro. No X11 a janela nativa é posicionada. Os
//! campos do relatório vêm do que o SO respondeu, não do que pedimos.

use std::process::Command;
use std::thread;
use std::time::Duration;

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::config::model::OverlayPosition;
use crate::deck::DeckState;

use super::probe::is_wayland;

/// A janela que mostra a camada ativa.
pub const HUD_LABEL: &str = "overlay";
const HUD_TITLE: &str = "MoonDeck HUD";
/// Avisa o React de que a janela, já existente, voltou a ser mostrada.
pub const HUD_SHOW_EVENT: &str = "overlay://show";
/// Uma tecla acabou de disparar; o payload é o nome da tecla.
pub const HUD_FIRE_EVENT: &str = "overlay://fire";
/// Tamanho inicial; o React mede o conteúdo e pede o tamanho real (`overlay_fit`).
const HUD_SIZE: (f64, f64) = (560.0, 160.0);

fn build_hud(app: &AppHandle) -> Result<WebviewWindow, String> {
    // Janela pequena, do tamanho do cartão. Em tela cheia ela cobria o
    // monitor e impedia de clicar em qualquer outra coisa enquanto estava lá.
    let builder = WebviewWindowBuilder::new(
        app,
        HUD_LABEL,
        WebviewUrl::App("index.html?surface=hud".into()),
    )
    .title(HUD_TITLE)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .shadow(false)
    .focused(false)
    .resizable(false)
    // Visível desde o início: o WebKit não executa JS numa janela que nunca foi
    // mostrada, e o React precisa montar para avisar (`overlay_ready`). Ela
    // nasce transparente e vazia — o cartão só é desenhado quando o Rust manda.
    .visible(true)
    .inner_size(HUD_SIZE.0, HUD_SIZE.1);
    // No Linux quem impede o foco é a regra do KWin (acima). No Windows e no
    // macOS a janela não pode ser ativada: mostrar o overlay não tira o foco do
    // jogo ou do editor.
    #[cfg(not(target_os = "linux"))]
    let builder = builder.focusable(false);
    builder
        .build()
        .map_err(|error| format!("não foi possível criar o HUD: {error}"))
}

/// Canto da tela, em coordenadas lógicas, para uma janela `win` dentro do
/// monitor `(mx, my, mw, mh)`.
fn anchor(
    position: OverlayPosition,
    margin: f64,
    monitor: (f64, f64, f64, f64),
    win: (f64, f64),
) -> (f64, f64) {
    let (mx, my, mw, mh) = monitor;
    let (ww, wh) = win;
    let left = mx + margin;
    let center_x = mx + (mw - ww) / 2.0;
    let right = mx + mw - ww - margin;
    let top = my + margin;
    let center_y = my + (mh - wh) / 2.0;
    let bottom = my + mh - wh - margin;

    use OverlayPosition::*;
    match position {
        TopLeft => (left, top),
        TopCenter => (center_x, top),
        TopRight => (right, top),
        CenterLeft => (left, center_y),
        Center => (center_x, center_y),
        CenterRight => (right, center_y),
        BottomLeft => (left, bottom),
        BottomCenter => (center_x, bottom),
        BottomRight => (right, bottom),
    }
}

/// Posiciona o HUD. No X11/Windows/macOS é `set_position`; no Wayland o
/// cliente não escolhe onde a janela fica, então o KWin é quem a move
/// (`kdotool windowmove`, a mesma via do `ABOVE` acima).
fn place(app: &AppHandle, window: &WebviewWindow) {
    let overlay = app.state::<DeckState>().config().general.overlay;
    // No Wayland o monitor "primário" pode não existir para o GTK; cai para o
    // monitor atual da janela e, por fim, o primeiro da lista.
    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| {
            app.available_monitors()
                .ok()
                .and_then(|monitors| monitors.into_iter().next())
        });
    let Some(monitor) = monitor else {
        log::warn!("nenhum monitor encontrado: o HUD fica onde o compositor o colocou");
        return;
    };
    let scale = monitor.scale_factor();
    let area = (
        monitor.position().x as f64 / scale,
        monitor.position().y as f64 / scale,
        monitor.size().width as f64 / scale,
        monitor.size().height as f64 / scale,
    );
    let size = window
        .outer_size()
        .map(|size| (size.width as f64 / scale, size.height as f64 / scale))
        .unwrap_or(HUD_SIZE);
    let (x, y) = anchor(overlay.position, f64::from(overlay.margin), area, size);
    log::info!(
        "HUD: {:?} em ({x:.0}, {y:.0}); monitor {:.0}x{:.0}+{:.0}+{:.0}, janela {:.0}x{:.0}",
        overlay.position, area.2, area.3, area.0, area.1, size.0, size.1
    );

    if is_wayland() {
        move_with_kwin(x.round() as i32, y.round() as i32);
    } else if let Err(error) = window.set_position(LogicalPosition::new(x, y)) {
        log::warn!("não foi possível posicionar o HUD: {error}");
    }
}

/// Lê `Position: x,y` do `kdotool getwindowgeometry`.
fn kwin_position(id: &str) -> Option<(i32, i32)> {
    let output = Command::new("kdotool")
        .args(["getwindowgeometry", id])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let rest = text.split("Position:").nth(1)?;
    let pair = rest.split_whitespace().next()?;
    let (x, y) = pair.split_once(',')?;
    Some((x.trim().parse().ok()?, y.trim().parse().ok()?))
}

/// Move o HUD pelo KWin e **confere**. O KWin posiciona a janela de novo
/// quando ela é mapeada (logo depois do `show()`), por cima de qualquer
/// movimento anterior; então mover uma vez não basta: repete até a posição
/// medida bater com a pedida.
fn move_with_kwin(x: i32, y: i32) {
    for attempt in 0..12 {
        thread::sleep(Duration::from_millis(if attempt == 0 { 30 } else { 45 }));

        let search = Command::new("kdotool")
            .args(["search", "--name", HUD_TITLE])
            .output();
        let id = match search {
            Ok(output) if output.status.success() => String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::trim)
                .find(|line| !line.is_empty())
                .map(str::to_string),
            Ok(_) => None,
            Err(error) => {
                log::warn!("kdotool indisponível: {error}");
                return;
            }
        };
        // Ainda não mapeada: tenta de novo.
        let Some(id) = id else {
            continue;
        };

        if kwin_position(&id) == Some((x, y)) {
            return;
        }
        let moved = Command::new("kdotool")
            .args(["windowmove", &id, &x.to_string(), &y.to_string()])
            .output();
        if let Ok(output) = &moved {
            if !output.status.success() {
                log::warn!(
                    "kdotool windowmove falhou: {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                );
                return;
            }
        }
    }
    log::warn!("o KWin não manteve o HUD em ({x}, {y}) depois de 12 tentativas");
}

/// Mostra o HUD já no lugar e avisa o React, que faz o fade de entrada.
/// Bloqueia (fala com o KWin): chamar de thread ou de comando assíncrono.
fn present(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    window
        .show()
        .map_err(|error| format!("não foi possível mostrar o HUD: {error}"))?;
    place(app, window);
    app.emit_to(HUD_LABEL, HUD_SHOW_EVENT, ())
        .map_err(|error| format!("falha ao emitir {HUD_SHOW_EVENT}: {error}"))
}

/// Regra de janela do KWin para o HUD: nunca aceita foco, não entra no
/// alt-tab, no pager nem na barra de tarefas e fica por cima. É o que faz dele
/// "só um overlay": aparecer não tira o foco do jogo ou do editor, e passar o
/// mouse continua funcionando. Só o KWin sabe impedir a ativação de uma janela
/// no Wayland; o `focusable(false)` do GTK sozinho não basta.
///
/// Gravada uma vez em `~/.config/kwinrulesrc` (grupo `moondeck-hud`), sem tocar
/// nas outras regras do usuário.
fn ensure_kwin_rule() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        if !is_wayland() {
            return;
        }
        let read = |group: &str, key: &str| -> String {
            Command::new("kreadconfig6")
                .args(["--file", "kwinrulesrc", "--group", group, "--key", key])
                .output()
                .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
                .unwrap_or_default()
        };
        let write = |group: &str, key: &str, value: &str| -> bool {
            Command::new("kwriteconfig6")
                .args(["--file", "kwinrulesrc", "--group", group, "--key", key, value])
                .status()
                .is_ok_and(|status| status.success())
        };

        const GROUP: &str = "moondeck-hud";
        let current = read(GROUP, "title") == HUD_TITLE
            && read(GROUP, "acceptfocus") == "false"
            && read(GROUP, "acceptfocusrule") == "2";
        if current {
            return;
        }
        // 2 = "Forçar": vale sempre, não só na criação.
        let fields: [(&str, &str); 14] = [
            ("Description", "MoonDeck HUD (não rouba foco)"),
            ("title", HUD_TITLE),
            ("titlematch", "1"),
            ("acceptfocus", "false"),
            ("acceptfocusrule", "2"),
            ("skipswitcher", "true"),
            ("skipswitcherrule", "2"),
            ("skippager", "true"),
            ("skippagerrule", "2"),
            ("skiptaskbar", "true"),
            ("skiptaskbarrule", "2"),
            ("above", "true"),
            ("aboverule", "2"),
            ("types", "1"),
        ];
        if !fields.iter().all(|(key, value)| write(GROUP, key, value)) {
            log::warn!("não foi possível gravar a regra de janela do HUD (kwriteconfig6)");
            return;
        }
        // Registra o grupo na lista de regras, preservando as do usuário. O
        // Plasma novo guarda a lista em `Order`; o formato antigo, em `rules` +
        // `count` (o KWin converte sozinho ao reler).
        let order = read("General", "Order");
        let ok = if order.is_empty() {
            let rules = read("General", "rules");
            let mut list: Vec<&str> = rules.split(',').filter(|name| !name.is_empty()).collect();
            if !list.contains(&GROUP) {
                list.push(GROUP);
            }
            write("General", "rules", &list.join(","))
                && write("General", "count", &list.len().to_string())
        } else {
            let mut list: Vec<&str> = order.split(',').filter(|name| !name.is_empty()).collect();
            if !list.contains(&GROUP) {
                list.push(GROUP);
            }
            write("General", "Order", &list.join(","))
        };
        if !ok {
            log::warn!("não foi possível registrar a regra de janela do HUD");
            return;
        }
        let _ = Command::new("busctl")
            .args(["--user", "call", "org.kde.KWin", "/KWin", "org.kde.KWin", "reconfigure"])
            .status();
        log::info!("regra de janela do HUD instalada no KWin");
    });
}

/// Mostra o HUD, criando a janela na primeira vez. Devolve `true` quando a
/// janela é nova: o React ainda vai montar e chama `overlay_ready`, que é
/// quem a apresenta. Quem esconde é o próprio React depois do tempo
/// configurado (`window.hide()`); a janela fica viva escondida.
pub fn show_hud(app: &AppHandle) -> Result<bool, String> {
    ensure_kwin_rule();
    if let Some(window) = app.get_webview_window(HUD_LABEL) {
        present(app, &window)?;
        return Ok(false);
    }
    build_hud(app)?;
    Ok(true)
}

/// O React do HUD montou e escuta os eventos: agora dá para apresentá-lo.
pub fn hud_ready(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(HUD_LABEL)
        .ok_or_else(|| "o HUD não existe".to_string())?;
    present(app, &window)
}

/// O React mediu o cartão: ajusta a janela a ele e reposiciona (as âncoras de
/// baixo e da direita dependem do tamanho).
pub fn hud_fit(app: &AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app
        .get_webview_window(HUD_LABEL)
        .ok_or_else(|| "o HUD não existe".to_string())?;
    window
        .set_size(LogicalSize::new(width.clamp(120.0, 1200.0), height.clamp(40.0, 900.0)))
        .map_err(|error| format!("não foi possível redimensionar o HUD: {error}"))?;
    if window.is_visible().unwrap_or(false) {
        place(app, &window);
    }
    Ok(())
}

/// Avisa o HUD de que uma tecla acabou de disparar (`Some`) ou só o mostra
/// (`None`). Roda numa thread própria: criar janela e falar com o KWin no
/// thread que chamou (comando, portal) pode travar o loop do GTK.
pub fn fire_hud(app: &AppHandle, key: Option<String>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let created = match show_hud(&app) {
            Ok(created) => created,
            Err(error) => {
                log::warn!("HUD não apareceu: {error}");
                return;
            }
        };
        let Some(key) = key else {
            return;
        };
        if created {
            // Janela nova: o React ainda está montando; espera ele escutar.
            thread::sleep(Duration::from_millis(700));
        }
        let _ = app.emit_to(HUD_LABEL, HUD_FIRE_EVENT, key);
    });
}

/// Traz a janela principal para a frente, opcionalmente numa tela.
pub fn open_main(app: &AppHandle, view: Option<String>) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "a janela principal não existe".to_string())?;
    let _ = window.unminimize();
    window
        .show()
        .and_then(|_| window.set_focus())
        .map_err(|error| format!("não foi possível abrir a janela principal: {error}"))?;
    if let Some(view) = view {
        let _ = app.emit_to("main", "app://navigate", view);
    }
    Ok(())
}

/// Limite do arquivo de fundo. O HUD tem ~500 px; uma foto de 20 MB não ajuda
/// ninguém e travaria a janela.
const MAX_IMAGE_BYTES: u64 = 6 * 1024 * 1024;

pub fn image_data_url(path: &std::path::Path) -> Result<String, String> {
    use base64::Engine;

    let mime = match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        Some("avif") => "image/avif",
        _ => return Err("use uma imagem png, jpg, webp, gif ou avif".to_string()),
    };
    let size = std::fs::metadata(path)
        .map_err(|error| format!("não foi possível abrir {}: {error}", path.display()))?
        .len();
    if size > MAX_IMAGE_BYTES {
        return Err(format!(
            "a imagem tem {} MB; o limite é {} MB",
            size / (1024 * 1024),
            MAX_IMAGE_BYTES / (1024 * 1024)
        ));
    }
    let bytes = std::fs::read(path)
        .map_err(|error| format!("não foi possível ler {}: {error}", path.display()))?;
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}
