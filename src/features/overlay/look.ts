import type { CSSProperties } from "react";
import type { ButtonStyle, KeyLook, OverlayAnimation, OverlayPreset, TimerStyle } from "@/lib/types";

/**
 * Temas prontos do HUD. Valores concretos (não tokens): o HUD flutua sobre
 * outros apps e o tema claro/escuro do app não deve mudá-lo.
 */
export interface HudPalette {
  bg: string;
  fg: string;
  accent: string;
}

export const HUD_PRESETS: Record<OverlayPreset, HudPalette> = {
  midnight: { bg: "#11161d", fg: "#e8edf3", accent: "#c9d6e3" },
  paper: { bg: "#f1f3f6", fg: "#141a22", accent: "#3d5a80" },
  forest: { bg: "#101a16", fg: "#e6efe9", accent: "#8fbf9f" },
  dusk: { bg: "#17141f", fg: "#ece8f4", accent: "#b7a4e6" },
};

export const PRESET_ORDER: readonly OverlayPreset[] = ["midnight", "paper", "forest", "dusk"];

/** Âmbar do estado "tocando" quando o usuário não escolheu um destaque. */
export const LIVE_AMBER = "#e8a33d";

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Texto claro ou escuro, o que contrastar mais com o fundo. */
export function readableOn(background: string): string {
  return luminance(background) > 0.34 ? "#141a22" : "#eef2f7";
}

export interface HudLook {
  preset: OverlayPreset;
  background: string | null;
  accent: string | null;
  imageDim: number;
  opacity: number;
  scale: number;
  customCss: string;
  animation?: OverlayAnimation;
  timerStyle?: TimerStyle;
  buttonStyle?: ButtonStyle;
  keys?: KeyLook;
}

/**
 * Variáveis CSS do cartão. A cor do texto sai do fundo (preset ou próprio):
 * quem escolhe um fundo claro recebe letra escura sem pensar nisso.
 */
export function hudStyle(look: HudLook, imageUrl: string | null): CSSProperties {
  const palette = HUD_PRESETS[look.preset];
  const bg = look.background ?? palette.bg;
  const keys = look.keys;
  const fg = keys?.text ?? (look.background ? readableOn(look.background) : palette.fg);
  const accent = look.accent ?? palette.accent;
  const live = keys?.keyPressed ?? look.accent ?? LIVE_AMBER;
  return {
    "--hud-bg": bg,
    "--hud-fg": fg,
    "--hud-accent": accent,
    "--hud-live": live,
    "--hud-live-ink": readableOn(live),
    ...(keys?.keyBg ? { "--hud-key-bg": keys.keyBg, "--hud-key-ink": keys.keyFg ?? readableOn(keys.keyBg) } : {}),
    ...(keys?.keyFg && !keys.keyBg ? { "--hud-key-ink": keys.keyFg } : {}),
    "--hud-opacity": `${look.opacity}%`,
    "--hud-dim": `${look.imageDim}%`,
    "--hud-image": imageUrl ? `url("${imageUrl}")` : "none",
    zoom: look.scale / 100,
  } as CSSProperties;
}

/**
 * CSS do usuário, preso ao cartão: o que ele escreve vale para o HUD (e para a
 * prévia), nunca para o resto do app. Usa `@scope`, com `:scope` apontando o
 * próprio cartão. Cada cartão tem um `data-scope`, então várias prévias na
 * mesma tela (a galeria de temas) não herdam o CSS umas das outras.
 */
export function scopeCss(css: string, scopeId = "hud"): string {
  return `@scope (.hud-card[data-scope="${scopeId}"]) {\n${css}\n}`;
}
