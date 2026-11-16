import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type KeycapTone = "default" | "mode" | "live" | "ghost";

export interface KeycapProps extends HTMLAttributes<HTMLElement> {
  tone?: KeycapTone;
  size?: "sm" | "md";
}

/**
 * Tecla física. É o elemento-assinatura do app: mono, caixa alta, borda
 * inferior mais grossa. `<kbd>` porque semanticamente é uma tecla.
 */
export function Keycap({ tone = "default", size = "md", className, children, ...rest }: KeycapProps) {
  return (
    <kbd
      className={cn(
        "keycap",
        tone !== "default" && `keycap--${tone}`,
        size === "sm" && "keycap--sm",
        className,
      )}
      {...rest}
    >
      {children}
    </kbd>
  );
}
