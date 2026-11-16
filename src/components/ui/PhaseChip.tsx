import { cn } from "@/lib/cn";

export interface PhaseChipProps {
  children: string;
  className?: string;
}

/** Marca o que ainda não existe. Toda tela incompleta precisa de uma. */
export function PhaseChip({ children, className }: PhaseChipProps) {
  return (
    <span
      className={cn(
        "t-label inline-flex h-5 items-center rounded-full border border-dashed border-line-strong px-2 text-ink-3",
        className,
      )}
    >
      {children}
    </span>
  );
}
