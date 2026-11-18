//! Captura global de teclas pelo portal `GlobalShortcuts` (Linux).
//!
//! No Wayland o compositor não entrega teclas globais para um cliente comum.
//! O portal é o caminho suportado: o KDE mostra um diálogo, o usuário aprova e
//! o vínculo fica no `kglobalaccel`. O backend do portal pode persistir o
//! vínculo entre sessões — isso é medido, não prometido.

use ashpd::desktop::{
    global_shortcuts::{BindShortcutsOptions, GlobalShortcuts, NewShortcut},
    CreateSessionOptions,
};
use futures_util::StreamExt;
use tauri::AppHandle;

use super::{Activation, BindResult, Binding, HotkeyRequest, APP_ID};

/// Ícone do app (256 px), embutido para o `.desktop` criado em runtime.
const APP_ICON: &[u8] = include_bytes!("../../../icons/128x128@2x.png");

/// O portal identifica o app pelo arquivo `<app id>.desktop`: sem ele, o
/// `Register` responde "App info not found". Instalado por pacote (.deb, .rpm)
/// o arquivo já existe; rodando solto (dev, AppImage) o app cria o dele, no
/// diretório do usuário, uma única vez. Nunca sobrescreve um existente.
fn ensure_desktop_entry() -> Result<(), String> {
    let data_home = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| {
            std::env::var_os("HOME").map(|home| std::path::Path::new(&home).join(".local/share"))
        })
        .ok_or_else(|| "sem $HOME para instalar o .desktop".to_string())?;
    let dir = data_home.join("applications");
    let file = dir.join(format!("{APP_ID}.desktop"));
    let exe = std::env::current_exe()
        .map_err(|error| format!("não foi possível descobrir o executável: {error}"))?;
    // Já existe e aponta para este executável: nada a fazer. Se o caminho mudou
    // (rebuild em outro diretório, AppImage movido), só o `Exec` é atualizado.
    if let Ok(existing) = std::fs::read_to_string(&file) {
        let current = existing
            .lines()
            .any(|line| line == format!("Exec={}", exe.display()))
            && existing.contains("Icon=")
            && existing.contains("StartupWMClass=");
        if current {
            return Ok(());
        }
    }
    std::fs::create_dir_all(&dir)
        .map_err(|error| format!("não foi possível criar {}: {error}", dir.display()))?;
    // O ícone vai junto: o KDE o procura pelo nome do app no tema do usuário.
    let icon_dir = data_home.join("icons/hicolor/256x256/apps");
    let icon_ok = std::fs::create_dir_all(&icon_dir)
        .and_then(|_| std::fs::write(icon_dir.join(format!("{APP_ID}.png")), APP_ICON))
        .is_ok();
    let contents = format!(
        "[Desktop Entry]\nType=Application\nName=MoonDeck\nComment=Teclas subutilizadas viram um deck de ações\nExec={}\n{}Terminal=false\nCategories=Utility;\nStartupNotify=false\n# O binário abre janelas com esta classe; sem isso o KDE não liga a janela ao ícone.\nStartupWMClass=moondeck\n",
        exe.display(),
        if icon_ok {
            format!("Icon={APP_ID}\n")
        } else {
            String::new()
        }
    );
    std::fs::write(&file, contents)
        .map_err(|error| format!("não foi possível gravar {}: {error}", file.display()))?;
    log::info!("gravado {}", file.display());
    Ok(())
}

/// O portal só atende atalhos globais de apps que sabe identificar, e um
/// binário solto (dev, AppImage) é anônimo: "An app id is required". O
/// `Registry` do xdg-desktop-portal deixa um app fora de sandbox declarar o
/// próprio id. Precisa rodar uma vez, antes de qualquer outra chamada.
async fn ensure_host_app_registered() -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    static DONE: AtomicBool = AtomicBool::new(false);
    if DONE.load(Ordering::Acquire) {
        return Ok(());
    }

    ensure_desktop_entry()?;

    let app_id = ashpd::AppID::try_from(APP_ID)
        .map_err(|error| format!("app id inválido ({APP_ID}): {error}"))?;
    ashpd::register_host_app(app_id)
        .await
        .map_err(|error| format!("não foi possível registrar o app no portal: {error}"))?;
    DONE.store(true, Ordering::Release);
    Ok(())
}

/// Sessão do portal em pé. `close` encerra de verdade: avisa o portal
/// (`Session.Close`) e só volta quando o KDE soltou as teclas. Abortar a tarefa
/// sem isso deixava a tecla presa no compositor — a janela nunca a recebia e
/// gravar `PgUp` de novo "não registrava".
pub struct BoundSession {
    stop: Option<futures::channel::oneshot::Sender<()>>,
    join: tauri::async_runtime::JoinHandle<()>,
}

impl BoundSession {
    pub async fn close(mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        let _ = self.join.await;
    }
}

/// Registra os atalhos no portal e deixa um listener vivo até `close`. Cada ativação chama `on_activated` — quem usa decide o que fazer
/// (o motor do deck executa a ação).
pub async fn bind_with(
    _app: &AppHandle,
    requests: Vec<HotkeyRequest>,
    on_activated: impl Fn(Activation) + Send + 'static,
) -> Result<(BindResult, BoundSession), String> {
    ensure_host_app_registered().await?;

    let portal = GlobalShortcuts::new()
        .await
        .map_err(|error| format!("portal GlobalShortcuts indisponível: {error}"))?;
    if requests.is_empty() {
        return Err("nenhuma tecla para registrar".to_string());
    }

    let session = portal
        .create_session(CreateSessionOptions::default())
        .await
        .map_err(|error| format!("não foi possível abrir a sessão do portal: {error}"))?;

    let shortcuts: Vec<NewShortcut> = requests
        .iter()
        .map(|request| {
            NewShortcut::new(request.id.clone(), request.description.clone())
                .preferred_trigger(request.trigger.as_str())
        })
        .collect();

    let request = portal
        .bind_shortcuts(&session, &shortcuts, None, BindShortcutsOptions::default())
        .await
        .map_err(|error| format!("o portal recusou o registro: {error}"))?;

    let response = request
        .response()
        .map_err(|error| format!("o diálogo do sistema foi encerrado: {error}"))?;

    let bindings: Vec<Binding> = response
        .shortcuts()
        .iter()
        .map(|shortcut| Binding {
            id: shortcut.id().to_string(),
            description: shortcut.description().to_string(),
            trigger: shortcut.trigger_description().to_string(),
        })
        .collect();

    let activated = portal
        .receive_activated()
        .await
        .map_err(|error| format!("não foi possível escutar as ativações: {error}"))?;

    let deactivated = portal
        .receive_deactivated()
        .await
        .map_err(|error| format!("não foi possível escutar as teclas soltas: {error}"))?;
    // As duas fontes viram um fluxo só: (id, instante, apertada?).
    let mut events = futures::stream::select(
        activated.map(|event| (event.shortcut_id().to_string(), event.timestamp().as_millis() as u32, true)),
        deactivated.map(|event| (event.shortcut_id().to_string(), event.timestamp().as_millis() as u32, false)),
    );

    let (stop, mut stop_rx) = futures::channel::oneshot::channel::<()>();

    let join = tauri::async_runtime::spawn(async move {
        use futures::future::{select, Either};

        loop {
            let next = events.next();
            futures::pin_mut!(next);
            match select(next, &mut stop_rx).await {
                Either::Left((Some((id, _timestamp_ms, pressed)), _)) => {
                    on_activated(Activation { id, pressed });
                }
                // Fim do fluxo ou pedido de parada.
                Either::Left((None, _)) | Either::Right(_) => break,
            }
        }

        if let Err(error) = session.close().await {
            log::warn!("o portal não confirmou o fechamento da sessão: {error}");
        }
    });

    Ok((
        BindResult { bindings },
        BoundSession {
            stop: Some(stop),
            join,
        },
    ))
}
