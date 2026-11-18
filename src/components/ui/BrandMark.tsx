import { useId, type CSSProperties } from "react";

export interface BrandMarkProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Marca: crescente. Duas formas, sem gradiente.
 * O id da máscara vem de `useId` porque a marca aparece em mais de um lugar.
 */
export function BrandMark({ size = 18, className, style }: BrandMarkProps) {
  const raw = useId();
  const maskId = `moon-${raw.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <defs>
        <mask id={maskId}>
          <rect width="18" height="18" fill="#fff" />
          <circle cx="12.1" cy="7.2" r="5.6" fill="#000" />
        </mask>
      </defs>
      <circle cx="9" cy="9" r="6.4" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
