import { AlertTriangle, Check, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type ToastTone = "neutral" | "success" | "danger";

export interface ToastMessage {
  id: number;
  text: string;
  tone?: ToastTone;
}

export interface ToastHostProps {
  message: ToastMessage | null;
  onDismiss: () => void;
  /** Tempo aberto antes de recolher sozinho. */
  duration?: number;
}

const toneIcons = {
  neutral: Info,
  success: Check,
  danger: AlertTriangle,
} as const;

/** Toast do transitions.dev: entra no relógio lento, sai no rápido. */
export function ToastHost({ message, onDismiss, duration = 3200 }: ToastHostProps) {
  return (
    <div className="pointer-events-none fixed bottom-12 right-5 z-50" aria-live="polite">
      {message ? (
        <ToastItem key={message.id} message={message} onDismiss={onDismiss} duration={duration} />
      ) : null}
    </div>
  );
}

interface ToastItemProps {
  message: ToastMessage;
  onDismiss: () => void;
  duration: number;
}

function ToastItem({ message, onDismiss, duration }: ToastItemProps) {
  const [open, setOpen] = useState(false);
  const tone = message.tone ?? "neutral";
  const Icon = toneIcons[tone];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setOpen(true));
    const hide = window.setTimeout(() => setOpen(false), duration);
    const remove = window.setTimeout(onDismiss, duration + 260);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(hide);
      window.clearTimeout(remove);
    };
  }, [duration, onDismiss]);

  return (
    <div className={cn("t-toast", open && "is-open")} role="status">
      <Icon
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "neutral" && "text-ink-2",
        )}
        strokeWidth={2}
      />
      <span className="t-small">{message.text}</span>
    </div>
  );
}
