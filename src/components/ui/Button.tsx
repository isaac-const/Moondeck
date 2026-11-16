import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  iconOnly?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  iconOnly = false,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "btn",
        `btn--${variant}`,
        size === "sm" && "btn--sm",
        iconOnly && "btn--icon",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
