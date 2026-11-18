import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export interface SkeletonRevealProps {
  loading: boolean;
  height: number;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Skeleton + cross-fade do transitions.dev. Enquanto `loading` é verdadeiro o
 * wrapper fica em `.is-resetting`, então a volta é instantânea; ao terminar,
 * `.is-revealed` faz o cross-fade com blur. Sem estado interno: a classe é
 * derivada do dado.
 */
export function SkeletonReveal({
  loading,
  height,
  skeleton,
  children,
  className,
}: SkeletonRevealProps) {
  return (
    <div
      className={cn(
        "t-skel",
        loading ? "is-resetting" : "is-revealed",
        className,
      )}
      style={{ height }}
      aria-busy={loading}
    >
      <div className="t-skel-skeleton is-pulsing" aria-hidden="true">
        {skeleton}
      </div>
      <div className="t-skel-content">{children}</div>
    </div>
  );
}
