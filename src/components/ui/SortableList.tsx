import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

/** O que quem desenha o item recebe para ligá-lo ao arrastar. */
export interface SortableItemState {
  /** Ligar no elemento que o usuário agarra (o próprio card). */
  attach: Ref<HTMLElement> | undefined;
  /** Espalhar no mesmo elemento: ponteiro, teclado e aria. */
  handleProps: HTMLAttributes<HTMLElement>;
  /** Este é o clone que acompanha o ponteiro. */
  overlay: boolean;
  /** Um arrasto acabou de terminar: o clique que o segue não deve contar. */
  justDragged: () => boolean;
}

export interface SortableListProps<T extends { id: string }> {
  items: readonly T[];
  /** Nova ordem, só os ids. A lista já mostra a ordem nova enquanto isso roda. */
  onReorder: (ids: string[]) => Promise<void> | void;
  layout: "grid" | "list";
  label: (item: T) => string;
  children: (item: T, state: SortableItemState) => ReactNode;
  disabled?: boolean;
  className?: string;
  /** Atributos do contêiner (ex.: `role="tablist"` e o tratamento de teclas). */
  containerProps?: HTMLAttributes<HTMLDivElement>;
  /** Fica depois dos itens, fora da ordenação (ex.: o "Adicionar"). */
  trailing?: ReactNode;
  /** Avisa quando um arrasto começa/termina (ex.: pausar atalhos de teclado). */
  onDraggingChange?: (dragging: boolean) => void;
}

const SETTLE_MS = 220;

// Quando o último arrasto terminou. Global de módulo: só existe um arrasto por
// vez na tela, e o clique que o segue precisa ser ignorado por quem o recebe.
let lastDragEnd = 0;
function markDragEnd(): void {
  lastDragEnd = performance.now();
}
function justDragged(): boolean {
  return performance.now() - lastDragEnd < 250;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lista reordenável por arrastar. Pensada para o toque ser bom:
 * - o arrasto só começa depois de ~6 px de movimento, então clicar continua
 *   clicando;
 * - o item agarrado vira um clone levemente inclinado e elevado; no lugar
 *   dele fica um vazio pontilhado, e os vizinhos deslizam para abrir espaço;
 * - ao soltar, o clone assenta no lugar e a ordem já vale na tela, sem esperar
 *   o disco;
 * - teclado: Espaço pega, setas movem, Espaço solta, Esc cancela. (Enter fica
 *   livre para a ação normal do item.)
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  layout,
  label,
  children,
  disabled = false,
  className,
  containerProps,
  trailing,
  onDraggingChange,
}: SortableListProps<T>) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  // Ordem local enquanto o Rust grava: evita o item voltar ao lugar antigo
  // por um instante depois de soltar.
  const [pending, setPending] = useState<string[] | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const shown = pending
    ? [...items].sort((a, b) => pending.indexOf(a.id) - pending.indexOf(b.id))
    : items;
  const ids = shown.map((item) => item.id);
  const activeItem = shown.find((item) => item.id === activeId) ?? null;
  const position = (id: string | number): string =>
    t("reorder.position", { index: ids.indexOf(String(id)) + 1, total: ids.length });
  const nameOf = (id: string | number): string => {
    const item = shown.find((candidate) => candidate.id === id);
    return item ? label(item) : String(id);
  };

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("reorder.picked", { name: nameOf(active.id), position: position(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("reorder.moved", { name: nameOf(active.id), position: position(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      t("reorder.dropped", { name: nameOf(active.id), position: position(over?.id ?? active.id) }),
    onDragCancel: ({ active }) => t("reorder.cancelled", { name: nameOf(active.id) }),
  };

  function handleStart(event: DragStartEvent): void {
    setActiveId(String(event.active.id));
    onDraggingChange?.(true);
  }

  async function handleEnd(event: DragEndEvent): Promise<void> {
    setActiveId(null);
    markDragEnd();
    onDraggingChange?.(false);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    setPending(next);
    try {
      await onReorder(next);
    } finally {
      setPending(null);
    }
  }

  function handleCancel(): void {
    setActiveId(null);
    markDragEnd();
    onDraggingChange?.(false);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={layout === "list" ? [restrictToVerticalAxis] : undefined}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t("reorder.instructions") },
      }}
      onDragStart={handleStart}
      onDragEnd={(event) => void handleEnd(event)}
      onDragCancel={handleCancel}
    >
      <SortableContext
        items={ids}
        strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        <div {...containerProps} className={className}>
          {shown.map((item) => (
            <SortableSlot key={item.id} id={item.id} disabled={disabled} justDragged={justDragged}>
              {(state) => children(item, state)}
            </SortableSlot>
          ))}
          {trailing}
        </div>
      </SortableContext>

      <DragOverlay
        adjustScale={false}
        dropAnimation={
          prefersReducedMotion()
            ? null
            : { duration: SETTLE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        }
      >
        {activeItem ? (
          <div className={cn("sortable-lifted", layout === "list" && "sortable-lifted--list")}>
            {children(activeItem, {
              attach: undefined,
              handleProps: {},
              overlay: true,
              justDragged,
            })}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface SortableSlotProps {
  id: string;
  disabled: boolean;
  justDragged: () => boolean;
  children: (state: SortableItemState) => ReactNode;
}

function SortableSlot({ id, disabled, justDragged, children }: SortableSlotProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      disabled,
      transition: prefersReducedMotion()
        ? null
        : { duration: SETTLE_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    });

  return (
    <div
      ref={setNodeRef}
      role="presentation"
      className="sortable-slot"
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      {children({
        attach: setActivatorNodeRef,
        // Só o que o arrasto acrescenta: o papel (button, tab…) e o tabIndex
        // continuam de quem desenha o item.
        handleProps: {
          "aria-roledescription": attributes["aria-roledescription"],
          "aria-describedby": attributes["aria-describedby"],
          ...listeners,
        } as HTMLAttributes<HTMLElement>,
        overlay: false,
        justDragged,
      })}
    </div>
  );
}
