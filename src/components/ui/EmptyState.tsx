import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  body: string;
  children?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, body, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-8 py-12 text-center",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-5 text-ink-3" strokeWidth={1.5} />
      <h2 className="t-h2">{title}</h2>
      <p className="t-small max-w-[46ch] text-ink-2">{body}</p>
      {children ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  );
}
