import { useTranslation } from "react-i18next";
import { useEngineStore } from "@/features/deck/engine";
import { cn } from "@/lib/cn";

/**
 * Estado da captura global de teclas, em uma linha discreta (ponto + texto).
 * Âmbar só quando está de fato ligada: é um estado do sistema, não decoração.
 */
export function EngineStatusPill({ className }: { className?: string }) {
  const { t } = useTranslation();
  const status = useEngineStore((s) => s.status);
  if (!status) return null;

  const held = status.holds.length > 0;
  const paused = status.paused && status.phase === "active";
  const label =
    paused
      ? t("engine.paused")
      : status.phase === "active"
      ? t("engine.active")
      : status.phase === "binding"
        ? t("engine.binding")
        : status.phase === "error"
          ? t("engine.error")
          : held
            ? t("engine.held")
            : t("engine.off");

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-2 text-[11.5px]",
        status.phase === "active" && !paused
          ? "text-live-strong"
          : status.phase === "error"
            ? "text-danger"
            : "text-text-tertiary",
        className,
      )}
      title={status.error ?? undefined}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status.phase === "active" && !paused ? "bg-live" : status.phase === "error" ? "bg-danger" : "bg-ink-3",
          status.phase === "binding" && "animate-pulse",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
