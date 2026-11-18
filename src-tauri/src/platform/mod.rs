//! Comandos de plataforma expostos à interface.

pub mod app_icon;
pub mod apps;
pub mod devices;
pub mod autostart;
pub mod hotkeys;
pub mod input_devices;
#[cfg(target_os = "linux")]
pub mod inject;
#[cfg(not(target_os = "linux"))]
#[path = "inject_native.rs"]
pub mod inject;
pub mod mic;
pub mod overlay;
#[cfg(target_os = "linux")]
pub mod playback;
#[cfg(not(target_os = "linux"))]
#[path = "playback_native.rs"]
pub mod playback;
pub mod probe;
pub mod sound;
pub mod tray;

use tauri::{AppHandle, State};

use sound::{PeaksReport, SoundEdit};

async fn blocking<T, F>(task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("tarefa de plataforma falhou: {error}"))?
}

/// Mostra o HUD agora, sem trocar de modo: serve para testar posição, tempo e
/// aparência.
#[tauri::command]
#[specta::specta]
pub fn overlay_preview(app: AppHandle) {
    overlay::fire_hud(&app, None);
}

/// Forma de onda do arquivo, para a tela de edição de som.
#[tauri::command]
#[specta::specta]
pub async fn sound_peaks(file: String, buckets: u32) -> Result<PeaksReport, String> {
    blocking(move || sound::peaks(std::path::Path::new(&file), buckets as usize)).await
}

/// Toca o som com as edições, pelo mesmo caminho da tecla (sink e volume geral
/// da config incluídos).
#[tauri::command]
#[specta::specta]
pub async fn sound_preview(
    deck: State<'_, crate::deck::DeckState>,
    file: String,
    edit: SoundEdit,
) -> Result<u32, String> {
    let audio = deck.config().general.audio;
    blocking(move || {
        sound::play(
            std::path::Path::new(&file),
            &edit,
            audio.volume,
            audio.sink.as_deref(),
            true,
        )
    })
    .await
}

/// Lê uma imagem de fundo do overlay e devolve como `data:` URL: a janela do
/// HUD não precisa de permissão de arquivo e o CSP já aceita `data:`.
#[tauri::command]
#[specta::specta]
pub async fn overlay_image(path: String) -> Result<String, String> {
    blocking(move || overlay::image_data_url(std::path::Path::new(&path))).await
}

/// Programas instalados, para escolher em vez de digitar o executável.
#[tauri::command]
#[specta::specta]
pub async fn apps_list() -> Vec<apps::InstalledApp> {
    blocking(|| Ok::<_, String>(apps::list())).await.unwrap_or_default()
}

/// Ícone do programa que a ação abre (`None` se não achou).
#[tauri::command]
#[specta::specta]
pub async fn app_icon(command: String) -> Option<String> {
    blocking(move || Ok::<_, String>(app_icon::data_url(&command))).await.ok().flatten()
}

#[tauri::command]
#[specta::specta]
pub fn sound_stop() {
    sound::stop_all();
}

/// O HUD montou e já escuta os eventos: ele pode ser mostrado no lugar certo.
#[tauri::command]
#[specta::specta]
pub async fn overlay_ready(app: AppHandle) -> Result<(), String> {
    blocking(move || overlay::hud_ready(&app)).await
}

/// O HUD mediu o conteúdo: ajusta a janela (tamanho lógico) e reposiciona.
#[tauri::command]
#[specta::specta]
pub async fn overlay_fit(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    blocking(move || overlay::hud_fit(&app, width, height)).await
}

/// Encerra o app de verdade (solta as teclas no portal antes).
#[tauri::command]
#[specta::specta]
pub fn app_quit(app: AppHandle) {
    crate::engine::quit(&app);
}

/// Há ícone na bandeja? Sem ele, fechar a janela encerra o app.
#[tauri::command]
#[specta::specta]
pub fn app_tray_available(app: AppHandle) -> bool {
    tray::is_available(&app)
}

/// Abre a janela principal, opcionalmente numa tela (`modes`, `keys`…).
#[tauri::command]
#[specta::specta]
pub fn app_open_main(app: AppHandle, view: Option<String>) -> Result<(), String> {
    overlay::open_main(&app, view)
}

/// O que este sistema consegue fazer; a interface esconde o resto.
#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PlatformCaps {
    /// `linux`, `windows` ou `macos`.
    pub os: String,
    /// Microfone virtual e efeitos de voz (precisam do PipeWire).
    pub virtual_mic: bool,
    /// Manter a saída de áudio acordada.
    pub keep_awake: bool,
}

#[tauri::command]
#[specta::specta]
pub fn platform_caps() -> PlatformCaps {
    let linux = cfg!(target_os = "linux");
    PlatformCaps {
        os: std::env::consts::OS.to_string(),
        virtual_mic: linux,
        keep_awake: linux,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn audio_devices() -> devices::AudioDevices {
    blocking(|| Ok::<_, String>(devices::list())).await.unwrap_or_default()
}

/// Bipe curto na saída escolhida, para conferir se é a certa.
#[tauri::command]
#[specta::specta]
pub async fn audio_test(sink: Option<String>) -> Result<(), String> {
    blocking(move || playback::play_wav(sound::test_tone(), sink.as_deref(), false)).await
}

/// Teclados e macropads conectados (só no Linux; nos outros sistemas, vazio).
#[tauri::command]
#[specta::specta]
pub async fn input_devices() -> Vec<input_devices::InputDevice> {
    blocking(|| Ok::<_, String>(input_devices::list())).await.unwrap_or_default()
}
