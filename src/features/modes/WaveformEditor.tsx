import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export interface WaveformEditorProps {
  peaks: readonly number[];
  durationMs: number;
  startMs: number;
  /** 0 = até o fim. */
  endMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  /** A prévia está tocando: a barra de progresso anda sobre o trecho. */
  playing?: boolean;
  /** Muda a cada início de prévia, para a barra recomeçar do zero. */
  playRun?: number;
  /** Duração real do trecho tocado (já cortado). */
  playLengthMs?: number;
  onPlayEnd?: () => void;
  onTrim: (startMs: number, endMs: number) => void;
}

const HEIGHT = 96;
/** Menor trecho que dá para deixar: abaixo disso o clipe some. */
const MIN_CLIP_MS = 50;

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const minutes = Math.floor(total / 60000);
  const seconds = (total % 60000) / 1000;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

/**
 * Forma de onda com duas alças para cortar o trecho. As alças são `slider`s
 * de verdade (setas movem 10 ms; Shift, 100 ms), então dá para editar sem
 * mouse. Fade-in e fade-out aparecem como rampas sobre o trecho.
 */
export function WaveformEditor({
  peaks,
  durationMs,
  startMs,
  endMs,
  fadeInMs,
  fadeOutMs,
  playing = false,
  playRun = 0,
  playLengthMs = 0,
  onPlayEnd,
  onTrim,
}: WaveformEditorProps) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [drag, setDrag] = useState<"start" | "end" | null>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);

  const end = endMs === 0 ? durationMs : endMs;
  const pct = (ms: number): number => (durationMs > 0 ? (ms / durationMs) * 100 : 0);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Progresso da prévia. Mexe direto no DOM a cada quadro: re-renderizar o
  // componente 60 vezes por segundo só para andar uma barra seria desperdício.
  useEffect(() => {
    const head = headRef.current;
    const played = playedRef.current;
    if (!head || !played) return;
    if (!playing || playLengthMs <= 0 || durationMs <= 0) {
      head.style.opacity = "0";
      played.style.opacity = "0";
      return;
    }
    const from = startMs;
    const began = performance.now();
    let frame = 0;
    const tick = (): void => {
      const elapsed = performance.now() - began;
      const progress = Math.min(1, elapsed / playLengthMs);
      const left = ((from + progress * playLengthMs) / durationMs) * 100;
      head.style.opacity = "1";
      head.style.left = `${left}%`;
      played.style.opacity = "1";
      played.style.left = `${(from / durationMs) * 100}%`;
      played.style.width = `${Math.max(0, left - (from / durationMs) * 100)}%`;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else onPlayEnd?.();
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // O trecho em reprodução é o do momento em que ela começou (`playRun`):
    // arrastar uma alça durante a prévia não deve reiniciar a barra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playRun]);

  // Desenho: barras espelhadas; o que está fora do trecho fica apagado.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || peaks.length === 0) return;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = HEIGHT * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, HEIGHT);

    const style = getComputedStyle(canvas);
    const active = style.getPropertyValue("--accent").trim() || "#c9d6e3";
    const dim = style.getPropertyValue("--line-strong").trim() || "#33404f";
    const max = Math.max(...peaks, 0.05);
    const bar = width / peaks.length;
    const mid = HEIGHT / 2;

    peaks.forEach((peak, index) => {
      const ms = ((index + 0.5) / peaks.length) * durationMs;
      const inside = ms >= startMs && ms <= end;
      const h = Math.max(1.5, (peak / max) * (HEIGHT - 12));
      context.fillStyle = inside ? active : dim;
      context.globalAlpha = inside ? 0.9 : 0.55;
      context.fillRect(index * bar + bar * 0.15, mid - h / 2, Math.max(1, bar * 0.7), h);
    });

    // Rampas de fade: uma linha do silêncio até o volume cheio.
    context.globalAlpha = 0.9;
    context.strokeStyle = style.getPropertyValue("--live").trim() || "#e8a33d";
    context.lineWidth = 1.5;
    const xs = (ms: number): number => (ms / durationMs) * width;
    if (fadeInMs > 0) {
      context.beginPath();
      context.moveTo(xs(startMs), HEIGHT - 4);
      context.lineTo(xs(Math.min(startMs + fadeInMs, end)), 4);
      context.stroke();
    }
    if (fadeOutMs > 0) {
      context.beginPath();
      context.moveTo(xs(Math.max(end - fadeOutMs, startMs)), 4);
      context.lineTo(xs(end), HEIGHT - 4);
      context.stroke();
    }
  }, [peaks, width, durationMs, startMs, end, fadeInMs, fadeOutMs]);

  function msFromPointer(event: PointerEvent<HTMLElement>): number {
    // A alça é filha direta da área da onda: o retângulo vem do próprio evento.
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    return Math.round(ratio * durationMs);
  }

  function move(handle: "start" | "end", ms: number): void {
    if (handle === "start") {
      onTrim(Math.min(Math.max(0, ms), end - MIN_CLIP_MS), endMs);
    } else {
      const next = Math.max(Math.min(durationMs, ms), startMs + MIN_CLIP_MS);
      // Encostar no fim do arquivo = "até o fim" (0), para o trecho acompanhar
      // caso o arquivo seja trocado por outro mais longo.
      onTrim(startMs, next >= durationMs - 5 ? 0 : next);
    }
  }

  function onKey(handle: "start" | "end", event: KeyboardEvent<HTMLElement>): void {
    const step = event.shiftKey ? 100 : 10;
    const current = handle === "start" ? startMs : end;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      move(handle, current - step);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      move(handle, current + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(handle, handle === "start" ? 0 : startMs + MIN_CLIP_MS);
    } else if (event.key === "End") {
      event.preventDefault();
      move(handle, handle === "start" ? end - MIN_CLIP_MS : durationMs);
    }
  }

  const handleProps = (handle: "start" | "end") => ({
    role: "slider" as const,
    tabIndex: 0,
    "aria-label": handle === "start" ? t("actions.handleStart") : t("actions.handleEnd"),
    "aria-valuemin": handle === "start" ? 0 : startMs + MIN_CLIP_MS,
    "aria-valuemax": handle === "start" ? end - MIN_CLIP_MS : durationMs,
    "aria-valuenow": handle === "start" ? startMs : end,
    "aria-valuetext": formatClock(handle === "start" ? startMs : end),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKey(handle, event),
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag(handle);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag === handle) move(handle, msFromPointer(event));
    },
    onPointerUp: () => setDrag(null),
    onPointerCancel: () => setDrag(null),
  });

  return (
    <div>
      <div
        ref={wrapRef}
        className="wave"
        style={{ height: HEIGHT }}
        data-dragging={drag ?? undefined}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: HEIGHT }} aria-hidden="true" />
        <div ref={playedRef} className="wave__played" aria-hidden="true" />
        <div className="wave__shade" style={{ left: 0, width: `${pct(startMs)}%` }} aria-hidden="true" />
        <div className="wave__shade" style={{ right: 0, width: `${100 - pct(end)}%` }} aria-hidden="true" />
        <div ref={headRef} className="wave__head" aria-hidden="true" />
        <div
          className={cn("wave__handle", drag === "start" && "is-active")}
          style={{ left: `${pct(startMs)}%` }}
          {...handleProps("start")}
        />
        <div
          className={cn("wave__handle", drag === "end" && "is-active")}
          style={{ left: `${pct(end)}%` }}
          {...handleProps("end")}
        />
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-3 font-mono text-xs text-text-secondary">
        <div>
          <dt className="t-label">{t("actions.trimStart")}</dt>
          <dd className="mt-0.5 tabular-nums text-text-primary">{formatClock(startMs)}</dd>
        </div>
        <div>
          <dt className="t-label">{t("actions.trimEnd")}</dt>
          <dd className="mt-0.5 tabular-nums text-text-primary">{formatClock(end)}</dd>
        </div>
        <div>
          <dt className="t-label">{t("actions.trimLength")}</dt>
          <dd className="mt-0.5 tabular-nums text-text-primary">{formatClock(end - startMs)}</dd>
        </div>
      </dl>
    </div>
  );
}
