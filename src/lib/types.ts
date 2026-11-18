/**
 * Nomes curtos para os tipos do IPC.
 *
 * O gerador cria dois formatos quando o serde aceita campos ausentes na
 * entrada (`_Deserialize`) e sempre os escreve na saída (`_Serialize`). A UI
 * só consome a saída, então este arquivo apelida um lado uma vez, em vez de
 * espalhar `_Serialize` por todo componente.
 */
import type {
  AudioSettings_Serialize,
  Config_Serialize,
  DeckError_Serialize,
  DeckSnapshot_Serialize,
  General_Serialize,
  MicStatus_Serialize,
  KeyLook_Serialize,
  SavedTheme_Serialize,
  ThemeLook_Serialize,
} from "./bindings";

/** Evento de tecla disparado pelo portal. Definido manualmente porque não está nos bindings. */
export interface HotkeyEvent {
  id: string;
  description: string;
  trigger: string;
  platformTimestampMs: number;
  /** Segundos desde a época (o Rust envia `receivedAtS`). */
  receivedAtS: number;
}

/** Resultado de uma ação executada pelo motor (`engine://action`). */
export interface ActionOutcome {
  actionId: string;
  label: string;
  ok: boolean;
  error: string | null;
}

// Re-export all types from bindings
export type {
  Action,
  ActionPayload,
  AudioDevices,
  PlatformCaps,
  SinkInfo,
  SourceInfo,
  Binding,
  ActionInput,
  PeaksReport,
  SoundEdit,
  OverlayPosition,
  OverlayPreset,
  OverlayAnimation,
  TimerStyle,
  ButtonStyle,
  KeyShape,
  KeySize,
  VoiceEffect,
  EnginePhase,
  EngineStatus,
  LayoutPreset,
  LocalePreference,
  MacroStep,
  Mode,
  ModeColor,
  ModeEdit,
  NewMode,
  Span,
  ThemePreference,
} from "./bindings";

export type AudioSettings = AudioSettings_Serialize;
export type Config = Config_Serialize;
export type DeckError = DeckError_Serialize;
export type DeckSnapshot = DeckSnapshot_Serialize;
export type General = General_Serialize;
export type MicStatus = MicStatus_Serialize;
export type KeyLook = KeyLook_Serialize;
export type SavedTheme = SavedTheme_Serialize;
export type ThemeLook = ThemeLook_Serialize;
