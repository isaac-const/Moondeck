import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  title: string;
  description?: string;
  control: ReactNode;
  htmlFor?: string;
  className?: string;
}

/** Linha de configuração: rótulo à esquerda, controle à direita. */
export function Field({ title, description, control, htmlFor, className }: FieldProps) {
  return (
    <div className={cn("flex items-start justify-between gap-6 py-4", className)}>
      <div className="min-w-0 max-w-[52ch]">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="t-h2 block">
            {title}
          </label>
        ) : (
          <span className="t-h2 block">{title}</span>
        )}
        {description ? <p className="t-small mt-1 text-ink-2">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">{control}</div>
    </div>
  );
}
