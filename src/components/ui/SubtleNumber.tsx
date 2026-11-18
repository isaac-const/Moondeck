import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/cn";

export interface SubtleNumberProps {
  value: number | null;
  suffix?: string;
  className?: string;
}

interface RenderState {
  current: string;
  old: string | null;
  direction: 1 | -1;
}

const EMPTY = "—";

/**
 * Número que muda sem chamar atenção (subtle number change): só os dígitos
 * alterados trocam, com deslocamento na direção do aumento/queda.
 */
export function SubtleNumber({ value, suffix, className }: SubtleNumberProps) {
  const initial = value === null ? EMPTY : String(value);
  const previous = useRef(initial);
  const [state, setState] = useState<RenderState>({
    current: initial,
    old: null,
    direction: 1,
  });

  useEffect(() => {
    const next = value === null ? EMPTY : String(value);
    const before = previous.current;

    if (before === next) return;
    previous.current = next;

    const from = Number(before);
    const to = Number(next);
    const direction: 1 | -1 =
      Number.isFinite(from) && Number.isFinite(to) && to < from ? -1 : 1;

    setState({ current: next, old: before, direction });

    const timer = window.setTimeout(() => {
      setState((current) => ({ ...current, old: null }));
    }, 520);

    return () => window.clearTimeout(timer);
  }, [value]);

  const length = Math.max(state.current.length, state.old?.length ?? 0);
  const digits = Array.from({ length }, (_, index) => {
    const newChar = state.current[index] ?? "";
    const oldChar = state.old?.[index] ?? "";
    const changed = state.old !== null && oldChar !== newChar;

    if (!changed) {
      return (
        <span key={index} className="inline-block">
          {newChar}
        </span>
      );
    }

    return (
      <span key={index} className="t-subtle-slot">
        <span className="t-subtle-old" aria-hidden="true">
          {oldChar}
        </span>
        <span className="t-subtle-new">{newChar}</span>
      </span>
    );
  });

  return (
    <span
      key={`${state.current}-${state.old ?? "rest"}`}
      className={cn("t-subtle-number", state.old !== null && "is-animating", className)}
      style={{ "--subtle-dir": state.direction } as CSSProperties}
    >
      {digits}
      {suffix ? <span className="ml-1 text-ink-3">{suffix}</span> : null}
    </span>
  );
}
