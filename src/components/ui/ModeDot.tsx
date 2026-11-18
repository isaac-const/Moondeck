import { cn } from "@/lib/cn";
import type { ModeColor } from "@/lib/types";

export interface ModeDotProps {
  color: ModeColor;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Identidade do modo. A cor é um nome da paleta fechada (Rust), traduzido para
 * `--mode-*` aqui: o tema claro e o escuro escolhem o tom, não o componente.
 */
export function ModeDot({ color, size = "md", className }: ModeDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block shrink-0 rounded-full",
        size === "sm" ? "size-1.5" : "size-2",
        className,
      )}
      style={{
        backgroundColor: `var(--mode-${color})`,
        boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.16)",
      }}
    />
  );
}
