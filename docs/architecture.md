# Arquitetura

```
src/                  Interface (React 19, Tailwind 4, Zustand, i18next)
  app/                Shell e navegação
  features/           Telas: modes, keys, appearance, audio, general, about,
                      onboarding e overlay (o HUD)
  components/         Componentes de interface reutilizáveis
  lib/bindings.ts     Tipos e chamadas do IPC, gerados pelo Rust (não editar)
src-tauri/src/
  config/             Modelo, validação, migração e gravação do config.json
  deck/               Comandos de modos, ações, temas, exportar e importar
  engine/             Liga teclas a ações; tecla de modo, modo Off, push-to-talk
  platform/           Tudo que depende do sistema (veja abaixo)
  keys.rs             Nome de tecla -> código, para os atalhos enviados
```

## Fluxo

```
tecla global ──► platform::hotkeys ──► engine ──► engine::actions
                                         │            ├─ som        (platform::sound → playback)
                                         │            ├─ atalho     (platform::inject)
                                         │            ├─ macro      (inject + sound + espera)
                                         │            ├─ voz        (platform::mic)
                                         │            └─ programa   (processo filho)
                                         └──► overlay (janela `overlay`, via eventos)
```

O motor registra no sistema só a tecla de modo e as teclas do modo ativo. As
demais continuam funcionando nos outros programas. Em modo Off, só a tecla de
modo fica registrada.

## `platform/`

Os módulos que mudam por sistema têm a mesma interface e são escolhidos em
tempo de compilação (`#[cfg(target_os = ...)]`):

| Módulo | Linux | Windows e macOS |
|---|---|---|
| `hotkeys` | `portal.rs` | `native.rs` |
| `inject` | `inject.rs` | `inject_native.rs` |
| `playback` | `playback.rs` | `playback_native.rs` |

`mic` (microfone virtual) e `apps`/`app_icon` (programas instalados) são só
Linux; nos outros sistemas as funções devolvem "indisponível" e a interface
esconde o recurso (`platform_caps`).

## Configuração

`config.json` fica no diretório de configuração do usuário, é versionado
(`config/migrate.rs`) e gravado de forma atômica com cópia `.bak`. Todo valor
vindo da interface ou de um arquivo importado passa por `Config::validate`.

## IPC

Os comandos usam `tauri-specta`. Rodar `cargo test` regenera
`src/lib/bindings.ts`.
