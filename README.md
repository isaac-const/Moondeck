# MoonDeck

Transforma teclas subutilizadas (`Home`, `PgUp`, `PgDn`, `End` e qualquer outra)
em um deck de ações contextuais. Uma tecla troca a **camada**; as outras
executam o que estiver mapeado naquela camada — som, atalho ou app. Um overlay
flutuante mostra a camada ativa e ensina a posição das teclas.

App desktop (Tauri 2 + React 19 + Rust) para Linux, Windows e macOS.

## Rodar

Requisitos: Node 22+, pnpm, Rust estável, e no Linux `webkit2gtk-4.1` + `gtk3`.

```bash
pnpm install
pnpm tauri dev      # janela real
pnpm dev            # só a UI no navegador (sem IPC)
pnpm typecheck
pnpm lint
pnpm build
```

## Estado

| Fase | Escopo | Estado |
|---|---|---|
| 0 | Fundação: scaffold, design system, shell, tema, i18n | **concluída** |
| 1 | Laboratório de plataforma (hotkeys, overlay, injeção, áudio) | próxima |
| 2 | Núcleo em Rust: config versionada, máquina de modos, IPC tipado | |
| 3 | Overlay HUD | |
| 4 | Ações reais + mic virtual | |
| 5 | Editores (modos, mapa tecla×modo com drag) | |
| 6 | Aparência + editor de layout do overlay | |
| 7 | Onboarding + i18n completo + revisão de acessibilidade | |
| 8 | Tray, autostart, pausa de emergência, empacotamento | |

O que **não** existe ainda: hotkeys reais, overlay, áudio, persistência em disco.
As telas marcam o que falta com um chip de fase — nada finge funcionar.

## Estrutura

```
src/
├── app/            # shell e navegação
├── components/
│   ├── layout/     # sidebar, barra de status
│   └── ui/         # primitivas do sistema (botão, keycap, segmented, switch…)
├── features/       # uma pasta por tela de configuração
├── i18n/           # PT-BR (fonte) + EN (tipado a partir do PT)
├── lib/            # utilitários, dados de exemplo, info de plataforma
├── styles/         # tokens, primitivas, base
└── theme/          # tema e movimento
src-tauri/          # backend Rust
docs/               # design system e matriz de plataforma
```

## Decisões que valem saber

- **`docs/platform-matrix.md`** — o brief assumia que o plugin de hotkeys resolve
  Wayland. Não resolve. O documento lista o que foi verificado no código-fonte e
  o que a Fase 1 precisa medir.
- **`docs/design.md`** — a regra do âmbar (só estado), o orçamento da serifa, a
  escala de movimento. Normativo: contrariar exige justificativa.
- **TypeScript 6**, não 7: o `typescript-eslint` ainda não suporta o compilador
  nativo, e lint funcionando vale mais que versão nova.
- **Tailwind + CSS de componente**: Tailwind para layout, CSS para peças com
  estado (as transições enumeram propriedades e ficariam ilegíveis inline).
- **Persistência em `localStorage`** é provisória e morre na Fase 2, quando o
  `config.json` versionado assumir.
