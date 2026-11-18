import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

export interface SuccessCheckProps {
  show: boolean;
  label: string;
  className?: string;
  size?: number;
}

/**
 * Marca de sucesso do transitions.dev (success check). O traço é desenhado
 * junto com a entrada; só entra quando algo realmente passou.
 */
export function SuccessCheck({ show, label, className, size = 16 }: SuccessCheckProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !show) return;
    node.dataset.state = "out";
    void node.offsetWidth;
    node.dataset.state = "in";
  }, [show]);

  if (!show) return null;

  return (
    <span
      ref={ref}
      className={cn("t-success-check", className)}
      data-state="out"
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 12.5L10.5 17L18 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
