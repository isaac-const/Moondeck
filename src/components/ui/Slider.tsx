import * as SliderPrimitive from "@radix-ui/react-slider";
import { useState } from "react";
import { cn } from "@/lib/cn";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label: string;
  /** Disparado ao soltar — é a hora de gravar. */
  onCommit: (value: number) => void;
  /** Texto ao lado do controle, ex.: "2,0 s". */
  format?: (value: number) => string;
  disabled?: boolean;
  className?: string;
}

/**
 * Slider com valor local enquanto arrasta: o app só grava quando o usuário
 * solta, em vez de reescrever o config.json a cada pixel.
 */
export function Slider({
  value,
  min,
  max,
  step,
  label,
  onCommit,
  format,
  disabled,
  className,
}: SliderProps) {
  // Valor local só enquanto arrasta; solto, a config volta a mandar.
  const [dragging, setDragging] = useState<number | null>(null);
  const draft = dragging ?? value;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SliderPrimitive.Root
        className="slider"
        value={[draft]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([next]) => setDragging(next ?? value)}
        onValueCommit={([next]) => {
          setDragging(null);
          onCommit(next ?? value);
        }}
      >
        <SliderPrimitive.Track className="slider__track">
          <SliderPrimitive.Range className="slider__range" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="slider__thumb" aria-label={label} />
      </SliderPrimitive.Root>
      <span className="t-mono w-12 shrink-0 text-right text-text-secondary">
        {format ? format(draft) : draft}
      </span>
    </div>
  );
}
