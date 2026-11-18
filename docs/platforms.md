# Suporte por sistema

| Recurso | Linux | Windows | macOS |
|---|---|---|---|
| Teclas globais | Portal `GlobalShortcuts` (Wayland e X11) | `RegisterHotKey` (plugin `global-shortcut`) | Carbon (plugin `global-shortcut`) |
| Teclas soltas (segurar para o modo Off, push-to-talk) | sim | sim | sim |
| Enviar atalhos e macros | `ydotool` | `enigo` | `enigo` (pede permissão de Acessibilidade) |
| Tocar sons | `pw-play` (PipeWire) | `rodio` | `rodio` |
| Escolher a saída de som | sim | sim | sim |
| Manter a saída acordada | sim | não | não |
| Microfone virtual e efeitos de voz | sim (PipeWire) | não | não |
| Lista de programas e ícones | sim (arquivos `.desktop`) | não | não |
| Detecção de macropads | sim (`/proc/bus/input/devices`) | não | não |
| Início com o sistema | `~/.config/autostart` | Registro do Windows | LaunchAgent |
| Bandeja | sim (precisa de `libayatana-appindicator`) | sim | sim |
| Overlay sem roubar o foco | sim | previsto, não testado | previsto, não testado |

O que não existe em um sistema some da interface (por exemplo, o tipo de ação "Voz").

## Linux

- **Wayland (KDE Plasma):** o portal pede aprovação das teclas na primeira vez.
  O app cria o próprio `dev.moondeck.app.desktop` em `~/.local/share/applications`
  porque o portal só atende apps que consegue identificar.
- **Posição do overlay:** no Wayland o app não posiciona janelas. Com
  [`kdotool`](https://github.com/jinliu/kdotool) instalado, o KWin move o overlay;
  sem ele, o overlay aparece onde o compositor decidir.
- **Atalhos enviados:** precisam do `ydotool` e de acesso a `/dev/uinput`
  (regra udev que dê permissão ao usuário). O app sobe o próprio `ydotoold` em
  um socket privado dentro de `$XDG_RUNTIME_DIR`.
- **Arquivos que o app grava fora da própria pasta:**
  `~/.local/share/applications/dev.moondeck.app.desktop` (e o ícone), para o
  portal identificar o app; `~/.config/autostart/dev.moondeck.app.desktop`
  quando o início automático está ligado; e, no KDE Wayland, uma regra de janela
  em `~/.config/kwinrulesrc` (grupo `moondeck-hud`) para que o overlay nunca
  receba foco. As outras regras do usuário não são alteradas.
- **Pacotes:** `webkit2gtk-4.1`, `gtk3`, `libayatana-appindicator`; para áudio,
  `pipewire` com `pw-play`, `pw-record` e `pactl`.

## Windows

- Teclas globais registradas pelo sistema ficam indisponíveis para os outros
  programas enquanto o modo ativo as usa.
- Jogos em tela cheia exclusiva ou programas abertos como administrador podem
  ignorar teclas globais.

## macOS

- Para enviar atalhos, autorize o MoonDeck em Ajustes do Sistema, Privacidade e
  Segurança, Acessibilidade.
- O app não é assinado nem notarizado: na primeira abertura, use clique direito,
  Abrir.

## Estado dos testes

O workflow de integração contínua compila e testa nos três sistemas. O
caminho Linux (KDE Plasma, Wayland) é o que foi usado no dia a dia. Os
caminhos de Windows e macOS dependem de APIs do sistema que só se confirmam em
uma máquina real; relate problemas em *Issues* informando o sistema e a versão.
