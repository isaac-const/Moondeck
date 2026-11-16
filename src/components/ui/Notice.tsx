import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface NoticeProps {
  children: ReactNode;
  className?: string;
}

/** Aviso honesto de escopo. Tracejado de propósito: não é um card de conteúdo. */
export function Notice({ children, className }: NoticeProps) {
  return (
    <div className={cn("notice", className)} role="note">
      <Info aria-hidden="true" className="mt-px size-3.5 shrink-0 text-ink-3" strokeWidth={1.6} />
      <p>{children}</p>
    </div>
  );
}
