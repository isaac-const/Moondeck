import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";
import type { ModeColor } from "@/lib/types";
import { ModeDot } from "@/components/ui/ModeDot";
import { SortableList } from "@/components/ui/SortableList";
import { SuccessCheck } from "@/components/ui/SuccessCheck";

export interface ModeCardItem {
  id: string;
  label: string;
  color: ModeColor;
  active: boolean;
  /** Linha de apoio, ex.: "3 ações". */
  meta?: string;
}

export interface ModeCardListProps {
  items: readonly ModeCardItem[];
  onSelect: (id: string) => void;
  label: string;
  /** Com isto, os cards podem ser arrastados; recebe a nova ordem dos ids. */
  onReorder?: (ids: string[]) => Promise<void> | void;
  className?: string;
}

/**
 * Lista vertical de modos como cards. Semântica de abas (uma aba ativa, setas
 * e Home/End movem a seleção) porque trocar de card troca o painel ao lado.
 * O ✓ e o âmbar só aparecem no modo ativo — é estado, não decoração.
 */
export function ModeCardList({ items, onSelect, label, onReorder, className }: ModeCardListProps) {
  const { t } = useTranslation();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [dragging, setDragging] = useState(false);

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.active),
  );

  function move(index: number): void {
    const target = items[index];
    if (!target) return;
    onSelect(target.id);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // Com um card no ar, as setas pertencem ao arrasto, não à seleção.
    if (dragging) return;
    const last = items.length - 1;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        move(activeIndex === last ? 0 : activeIndex + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        move(activeIndex === 0 ? last : activeIndex - 1);
        break;
      case "Home":
        event.preventDefault();
        move(0);
        break;
      case "End":
        event.preventDefault();
        move(last);
        break;
    }
  }

  return (
    <SortableList
      items={items}
      layout="list"
      label={(item) => item.label}
      disabled={!onReorder || items.length < 2}
      onReorder={(ids) => onReorder?.(ids)}
      onDraggingChange={setDragging}
      className={cn("flex flex-col gap-2", className)}
      containerProps={{
        role: "tablist",
        "aria-orientation": "vertical",
        "aria-label": label,
        onKeyDown,
      }}
    >
      {(item, drag) => {
        const index = items.findIndex((candidate) => candidate.id === item.id);
        const { attach, handleProps, overlay, justDragged } = drag;
        return (
          <button
            ref={(node) => {
              if (!overlay) refs.current[index] = node;
              if (typeof attach === "function") attach(node);
            }}
            type="button"
            role="tab"
            id={overlay ? undefined : `mode-tab-${item.id}`}
            aria-selected={item.active}
            aria-controls={`mode-panel-${item.id}`}
            tabIndex={item.active ? 0 : -1}
            className="mode-card flex w-full items-center gap-3 rounded-xl border border-border-subtle bg-bg-elevated p-4 text-left"
            data-sortable-handle={onReorder ? "" : undefined}
            {...handleProps}
            onClick={() => {
              if (!justDragged()) onSelect(item.id);
            }}
          >
            <ModeDot color={item.color} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium text-text-primary">
                {item.label}
              </span>
              {item.meta ? (
                <span className="mt-0.5 block truncate font-mono text-xs text-text-tertiary">
                  {item.meta}
                </span>
              ) : null}
            </span>
            <SuccessCheck
              show={item.active}
              label={t("modes.active")}
              size={16}
              className="text-accent-amber"
            />
          </button>
        );
      }}
    </SortableList>
  );
}
