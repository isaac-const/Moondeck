import { cn } from "@/lib/cn";

export interface ModeDotProps {
  color: string;
  size?: "sm" | "md";
  className?: string;
}

/** Identidade do modo. A cor vem da config, nunca do tema. */
export function ModeDot({ color, size = "md", className }: ModeDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 rounded-full", size === "sm" ? "size-1.5" : "size-2", className)}
      style={{ backgroundColor: color, boxShadow: `0 0 0 1px rgb(0 0 0 / 0.25) inset` }}
    />
  );
}
