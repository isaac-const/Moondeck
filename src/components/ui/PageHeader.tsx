import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex items-start justify-between gap-6", className)}>
      <div className="min-w-0">
        <h1 className="t-h1">{title}</h1>
        {description ? <p className="t-small mt-1.5 max-w-[62ch] text-ink-2">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
