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
        <h1 className="font-sans text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] text-text-primary">{title}</h1>
        {description ? <p className="mt-2 max-w-[62ch] font-sans text-sm text-text-secondary">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
