import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  label: ReactNode;
  children: ReactElement;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number;
}

/**
 * Dica curta para controles sem texto visível. O gatilho precisa aceitar ref
 * (`asChild`), então envolvemos o elemento — não o recriamos.
 */
export function Tooltip({ label, children, side = "bottom", delay = 260 }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="tooltip" side={side} sideOffset={6} collisionPadding={8}>
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
