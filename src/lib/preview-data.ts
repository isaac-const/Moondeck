import type { Dictionary } from "@/i18n/types";

export type ActionKind = "sound" | "shortcut" | "app";

export interface PreviewAction {
  /** Tecla física que dispara a ação. */
  key: string;
  labelKey: keyof Dictionary["modes"]["actions"];
  /** Fato concreto: nome do arquivo, combinação, binário. */
  detail: string;
  kind: ActionKind;
}

export interface PreviewMode {
  id: string;
  nameKey: keyof Dictionary["modes"]["names"];
  /** Cor de identidade do modo. Meios-tons frios: funcionam nos dois temas. */
  color: string;
  modeKey: string;
  actions: readonly PreviewAction[];
}

/** Paleta de identidade dos modos. Sem violeta e sem âmbar (reservado a estado). */
export const modeColors = [
  "#8fb6dc",
  "#9cc3a4",
  "#86c0bb",
  "#aeb8c6",
  "#d2a2a8",
  "#d2a087",
  "#c9b894",
  "#b9b4a8",
] as const;

/**
 * Dados de exemplo da Fase 0. Não é estado do app: na Fase 2 isto vem do
 * config.json via IPC e este arquivo desaparece.
 */
export const previewModes: readonly PreviewMode[] = [
  {
    id: "soundboard",
    nameKey: "soundboard",
    color: modeColors[0],
    modeKey: "Home",
    actions: [
      { key: "PgUp", labelKey: "applause", detail: "aplausos.wav", kind: "sound" },
      { key: "PgDn", labelKey: "horn", detail: "buzina.wav", kind: "sound" },
      { key: "End", labelKey: "farewell", detail: "tchau.wav", kind: "sound" },
    ],
  },
  {
    id: "shortcuts",
    nameKey: "shortcuts",
    color: modeColors[1],
    modeKey: "Home",
    actions: [
      { key: "PgUp", labelKey: "copy", detail: "Ctrl+C", kind: "shortcut" },
      { key: "PgDn", labelKey: "paste", detail: "Ctrl+V", kind: "shortcut" },
      { key: "End", labelKey: "undo", detail: "Ctrl+Z", kind: "shortcut" },
    ],
  },
  {
    id: "apps",
    nameKey: "apps",
    color: modeColors[3],
    modeKey: "Home",
    actions: [
      { key: "PgUp", labelKey: "terminal", detail: "kitty", kind: "app" },
      { key: "PgDn", labelKey: "browser", detail: "firefox", kind: "app" },
      { key: "End", labelKey: "music", detail: "spotify", kind: "app" },
    ],
  },
];
