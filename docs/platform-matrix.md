# Matriz de plataforma

Estado: **aberto** — a Fase 1 preenche esta tabela com resultado de teste, não com
suposição.

## O que já foi verificado no código-fonte (2026-11)

| Premissa do brief | Realidade | Impacto |
|---|---|---|
| `tauri-plugin-global-shortcut` abstrai Wayland via portal | **Falso.** O plugin usa o crate `global-hotkey`, que no Linux é X11-only (README do crate: "Linux (X11 Only)") | Captura de hotkey no Wayland precisa de KWin DBus ou do portal `org.freedesktop.portal.GlobalShortcuts` |
| Overlay pode ser posicionado livremente | **Falso no Wayland.** Cliente não posiciona toplevel; `set_position` é ignorado | Overlay será camada transparente em tela cheia no Wayland; janela nativa nos outros SOs |
| Injeção de tecla funciona globalmente | Parcial. Wayland exige `kdotool` (KWin DBus), `ydotool` (uinput + permissão) ou portal RemoteDesktop | Ação "atalho" precisa de backend por ambiente |

## O que a Fase 1 precisa medir

| Incógnita | Como testar | Critério de aceite |
|---|---|---|
| Captura de hotkey no KDE Wayland | Registrar `Home`, `PgUp`, `PgDn`, `End` por KWin DBus e por portal | Apertar `Home` dispara evento no backend com a janela do Discord em foco |
| Portal GlobalShortcuts | Sessão de `GlobalShortcuts` com lista dinâmica | Descobrir se o KDE persiste o vínculo entre sessões e se pede confirmação a cada boot |
| Janela de overlay | `transparent`, `alwaysOnTop`, `focus:false`, `skipTaskbar` | Overlay aparece sem roubar foco; cliques atravessam fora do deck (ou documentar que não atravessam) |
| Transparência real | Fundo `rgba` sobre janela de outro app | Sem borda preta; sem flicker ao mostrar/ocultar |
| Injeção de tecla | `kdotool`, `ydotool`, portal `RemoteDesktop` | `Ctrl+Shift+M` chega no Discord (mute) com foco no Discord |
| Enumeração de áudio | PipeWire/Pulse via `pactl`/`wpctl` e via crate | Lista de sinks reais, incluindo o sink virtual do MoonDeck |
| Latência de disparo | Log com timestamp no keypress e no play | < 80ms entre tecla e som |

## Consequências de produto já aceitas

- **Wayland:** o deck é arrastado **dentro** de uma camada em tela cheia. É o
  único desenho que entrega "arrastar a posição" sem depender do compositor.
- **X11 / Windows / macOS:** janela nativa pequena, posicionada pelo SO, com os
  mesmos presets de encaixe.
- **Teclas sintéticas:** detecção em cascata (`kdotool` → `ydotool` → portal) com
  aviso claro na UI quando nenhum caminho está disponível. Nunca falhar em
  silêncio.
- **"Qualquer tecla":** no Wayland via portal, só as teclas aprovadas pelo
  usuário no diálogo do sistema. Isso é limite do protocolo, não do app, e será
  dito na tela de Teclas.
