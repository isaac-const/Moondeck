import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { OverlayPosition } from "@/lib/types";

const grid: readonly OverlayPosition[] = [
  "top_left",
  "top_center",
  "top_right",
  "center_left",
  "center",
  "center_right",
  "bottom_left",
  "bottom_center",
  "bottom_right",
];

export interface PositionPickerProps {
  value: OverlayPosition;
  onChange: (value: OverlayPosition) => void;
  disabled?: boolean;
}

/**
 * Um monitor em miniatura dividido em 9 zonas. A zona escolhida mostra uma
 * barrinha — o overlay — que desliza de uma zona para outra.
 */
export function PositionPicker({ value, onChange, disabled }: PositionPickerProps) {
  const { t } = useTranslation();
  const index = Math.max(0, grid.indexOf(value));
  const column = index % 3;
  const row = Math.floor(index / 3);

  return (
    <div className="position-picker" role="radiogroup" aria-label={t("appearance.overlayPositionTitle")}>
      <div className="position-picker__screen">
        {grid.map((position) => (
          <button
            key={position}
            type="button"
            role="radio"
            aria-checked={position === value}
            aria-label={t(`appearance.positions.${position}`)}
            title={t(`appearance.positions.${position}`)}
            disabled={disabled}
            className={cn("position-picker__zone")}
            onClick={() => onChange(position)}
          />
        ))}
        <span
          aria-hidden="true"
          className="position-picker__hud"
          style={{
            left: `calc(${column} * (100% / 3) + (100% / 3 - 34px) / 2)`,
            top: `calc(${row} * (100% / 3) + (100% / 3 - 10px) / 2)`,
          }}
        />
      </div>
    </div>
  );
}
