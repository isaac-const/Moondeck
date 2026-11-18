import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface AccordionProps {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Disclosure com altura animada por `grid-template-rows: 0fr → 1fr` e chevron
 * que inverte no eixo Y. Sem medição de altura em JS.
 */
export function Accordion({
  title,
  meta,
  defaultOpen = false,
  children,
  className,
}: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={cn("t-acc", className)} data-open={open}>
      <button
        type="button"
        className="t-acc-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="t-acc-chevron" aria-hidden="true">
          <ChevronDown className="size-3.5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 truncate">{title}</span>
        {meta ? <span className="t-mono ml-auto shrink-0 text-ink-3">{meta}</span> : null}
      </button>
      <div id={panelId} className="t-acc-panel">
        <div className="t-acc-panel-inner">{children}</div>
      </div>
    </div>
  );
}
