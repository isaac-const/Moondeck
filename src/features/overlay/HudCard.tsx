import { Settings2 } from "lucide-react";
import { type CSSProperties, type PointerEventHandler } from "react";
import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/ui/BrandMark";
import { Keycap } from "@/components/ui/Keycap";
import { ModeDot } from "@/components/ui/ModeDot";
import { formatKey, sameKey } from "@/features/deck/keys";
import { cn } from "@/lib/cn";
import type { Mode, VoiceEffect } from "@/lib/types";
import { ActionIcon } from "./ActionIcon";
import { hudStyle, scopeCss, type HudLook } from "./look";

export interface HudCardProps {
  modes: readonly Mode[];
  mode: Mode;
  modeKey: string;
  look: HudLook;
  /** `data:` URL da imagem de fundo, já carregada. */
  imageUrl: string | null;
  /** Tecla que está "tocando" agora. */
  playing?: string | null;
  /** O HUD abriu pela tecla de modo: lembra que apertar de novo troca. */
  modeTapped?: boolean;
  voice?: VoiceEffect | null;
  /** Modo Off: só a tecla de modo está valendo. */
  paused?: boolean;
  /** 0 = sem linha do tempo. */
  hideAfterMs?: number;
  timerId?: number;
  /** `in`/`out` animam; sem fase, o cartão só aparece (prévia estática). */
  phase?: "in" | "out";
  hovered?: boolean;
  leaveMs?: number;
  /** Sem isto, os pontos de modo e a engrenagem ficam inertes (prévia). */
  onSelectMode?: (id: string) => void;
  onOpenSettings?: () => void;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
  className?: string;
  /** Identifica o cartão para o CSS próprio (prévias diferentes na mesma tela). */
  scopeId?: string;
}

/**
 * O cartão do overlay, só desenho: usado pela janela do HUD e pela prévia na
 * tela de Aparência, então o que se vê ao configurar é o que aparece no jogo.
 */
export function HudCard({
  modes,
  mode,
  modeKey,
  look,
  imageUrl,
  playing = null,
  modeTapped = false,
  voice = null,
  paused = false,
  hideAfterMs = 0,
  timerId = 0,
  phase,
  hovered = false,
  leaveMs = 180,
  onSelectMode,
  onOpenSettings,
  onPointerEnter,
  onPointerLeave,
  className,
  scopeId = "hud",
}: HudCardProps) {
  const { t } = useTranslation();
  const tile = look.buttonStyle === "tile";
  const style = {
    ...hudStyle(look, imageUrl),
    "--hud-ms": `${hideAfterMs}ms`,
    "--hud-out-ms": `${leaveMs}ms`,
  } as CSSProperties;

  return (
    <>
      {look.customCss.trim() ? <style>{scopeCss(look.customCss, scopeId)}</style> : null}
    <div
      role="status"
      aria-live="polite"
      data-phase={phase}
      data-hover={hovered}
      data-image={imageUrl ? "" : undefined}
      data-scope={scopeId}
      data-anim={look.animation ?? "fade"}
      data-key-bg={look.keys?.keyBg ? "" : undefined}
      data-key-fg={look.keys?.keyFg ? "" : undefined}
      data-key-shape={look.keys?.keyShape && look.keys.keyShape !== "default" ? look.keys.keyShape : undefined}
      data-key-size={look.keys?.keySize && look.keys.keySize !== "md" ? look.keys.keySize : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      style={style}
      className={cn("hud-card flex w-[500px] flex-col gap-3 rounded-[14px] p-4 pb-5", className)}
    >
      <header className="flex items-center gap-2.5">
        <BrandMark className="size-4 shrink-0" style={{ color: "var(--hud-accent)" }} />
        <div className="flex items-center gap-1" role="group" aria-label={t("modes.title")}>
          {modes.map((item) => (
            <button
              key={item.id}
              type="button"
              className="hud-dot"
              aria-label={item.name}
              aria-pressed={item.id === mode.id}
              title={item.name}
              disabled={!onSelectMode}
              onClick={() => onSelectMode?.(item.id)}
            >
              <ModeDot color={item.color} size={item.id === mode.id ? "md" : "sm"} />
            </button>
          ))}
        </div>
        <span className="hud-fg min-w-0 flex-1 truncate text-sm font-medium">{mode.name}</span>
        <Keycap size="sm" tone="mode" pressed={playing !== null && sameKey(playing, modeKey)}>
          {formatKey(modeKey)}
        </Keycap>
        {hideAfterMs > 0 && look.timerStyle === "ring" ? (
          <svg key={timerId} className="hud-ring" viewBox="0 0 20 20" aria-hidden="true">
            <circle className="hud-ring__track" cx="10" cy="10" r="8" />
            <circle className="hud-ring__fill" cx="10" cy="10" r="8" pathLength="100" />
          </svg>
        ) : null}
        <button
          type="button"
          className="hud-gear"
          aria-label={t("hud.openSettings")}
          title={t("hud.openSettings")}
          disabled={!onOpenSettings}
          onClick={onOpenSettings}
        >
          <Settings2 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
        </button>
      </header>

      {mode.actions.length > 0 ? (
        <ul
          className="hud-actions grid gap-2"
          data-style={tile ? "tile" : undefined}
          style={{
            gridTemplateColumns:
              (mode.columns ?? 0) > 0
                ? `repeat(${mode.columns ?? 0}, minmax(0, 1fr))`
                : `repeat(auto-fit, minmax(${tile ? 96 : 136}px, 1fr))`,
          }}
        >
          {mode.actions.map((action) => {
            const isPlaying = playing !== null && sameKey(playing, action.key);
            if (tile) {
              return (
                <li key={action.id} className="hud-action" data-style="tile" data-playing={isPlaying || undefined}>
                  <span className="hud-tile__face">
                    <ActionIcon
                      icon={action.icon ?? null}
                      payload={action.payload}
                      size={34}
                      fallback={<span className="hud-tile__glyph">{Array.from(action.label)[0]?.toUpperCase()}</span>}
                    />
                  </span>
                  <span className="hud-tile__label hud-fg-2">{action.label}</span>
                  <Keycap size="sm" tone={isPlaying ? "live" : "default"} pressed={isPlaying} className="hud-tile__key">
                    {formatKey(action.key)}
                  </Keycap>
                </li>
              );
            }
            return (
              <li key={action.id} className="hud-action" data-playing={isPlaying || undefined}>
                <ActionIcon icon={action.icon ?? null} payload={action.payload} />
                <Keycap size="sm" tone={isPlaying ? "live" : "default"} pressed={isPlaying}>
                  {formatKey(action.key)}
                </Keycap>
                <span className="hud-fg-2 min-w-0 truncate text-xs">{action.label}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hud-fg-2 text-[12.5px]">{t("hud.empty")}</p>
      )}

      {paused || voice || (modeTapped && modes.length > 1) ? (
        <div className="hud-foot">
          {paused ? (
            <span className="hud-paused">
              <span aria-hidden="true" className="hud-voice__dot" />
              {t("hud.paused")}
            </span>
          ) : voice ? (
            <span className="hud-voice">
              <span aria-hidden="true" className="hud-voice__dot" />
              {t("voice.badge", { name: t(`voice.${voice}`) })}
            </span>
          ) : (
            <span />
          )}
          {paused ? (
            <span className="hud-hint">
              <Keycap size="sm" tone="mode">
                {formatKey(modeKey)}
              </Keycap>
              <span>{t("hud.resumeHold")}</span>
            </span>
          ) : modeTapped && modes.length > 1 ? (
            <span className="hud-hint">
              <Keycap size="sm" tone="mode">
                {formatKey(modeKey)}
              </Keycap>
              <span>{t("hud.modeAgain")}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {hideAfterMs > 0 && (look.timerStyle ?? "bar") === "bar" ? (
        <div className="hud-timer" aria-hidden="true">
          <span key={timerId} className="hud-timer__fill" />
        </div>
      ) : null}
    </div>
    </>
  );
}
