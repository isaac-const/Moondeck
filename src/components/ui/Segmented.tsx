import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Grupo de rádio com indicador deslizante. Sem medição de DOM: as colunas são
 * 1fr, então a pílula anda em múltiplos da própria largura.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: SegmentedProps<T>) {
  const items = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const count = options.length;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (count === 0) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : 0;
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp" ? 1 : 0;
    if (!step && !back) return;
    event.preventDefault();
    const next = (activeIndex + (step || -back) + count) % count;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    items.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("seg", className)}
      onKeyDown={handleKeyDown}
    >
      <div
        aria-hidden="true"
        className="seg__pill"
        style={{
          width: `calc((100% - 4px) / ${count})`,
          transform: `translateX(calc(${activeIndex} * 100%))`,
        }}
      />
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              items.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={disabled}
            className="seg__item"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
