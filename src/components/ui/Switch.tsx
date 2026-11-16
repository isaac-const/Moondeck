import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>;

export function Switch({ className, ...rest }: SwitchProps) {
  return (
    <SwitchPrimitive.Root className={cn("switch", className)} {...rest}>
      <SwitchPrimitive.Thumb className="switch__thumb" />
    </SwitchPrimitive.Root>
  );
}
