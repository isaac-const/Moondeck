import { ChevronRight, Command, GripHorizontal, ListOrdered, Loader2, Mic, Music, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useState, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Keycap } from "@/components/ui/Keycap";
import { ModeCardList, type ModeCardItem } from "@/components/ui/ModeCard";
import { ModeDot } from "@/components/ui/ModeDot";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { SortableList, type SortableItemState } from "@/components/ui/SortableList";
import { SuccessCheck } from "@/components/ui/SuccessCheck";
import { useToastStore } from "@/components/ui/toast-store";
import { describeDeckError, deckErrorDetail } from "@/features/deck/errors";
import { formatKey } from "@/features/deck/keys";
import { MAX_ACTIONS, MAX_MODES } from "@/features/deck/limits";
import { canWrite, useDeckStore, type MutationResult } from "@/features/deck/store";
import type { Action, ActionInput, DeckError, Mode } from "@/lib/types";
import { ActionDialog } from "./ActionDialog";
import { ModeDialog, type ModeFormValue } from "./ModeDialog";

const kindIcons: Record<string, LucideIcon> = {
  sound: Music,
  shortcut: Command,
  voice: Mic,
  macro: ListOrdered,
  app: ChevronRight,
};

/**
 * `open` é separado do alvo: ao fechar, o alvo fica até o modal terminar de
 * sair, para o título e os campos não piscarem para "novo" durante a saída.
 */
interface DialogState {
  open: boolean;
  type: "create" | "edit";
  id?: string;
}

const CLOSED: DialogState = { open: false, type: "create" };

export function ModesScreen() {
  const { t } = useTranslation();
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const activate = useDeckStore((s) => s.activate);
  const createMode = useDeckStore((s) => s.createMode);
  const updateMode = useDeckStore((s) => s.updateMode);
  const deleteMode = useDeckStore((s) => s.deleteMode);
  const saveAction = useDeckStore((s) => s.saveAction);
  const deleteAction = useDeckStore((s) => s.deleteAction);
  const reorderActions = useDeckStore((s) => s.reorderActions);
  const reorderModes = useDeckStore((s) => s.reorderModes);
  const push = useToastStore((s) => s.push);

  const [modeDialog, setModeDialog] = useState<DialogState>(CLOSED);
  const [actionDialog, setActionDialog] = useState<DialogState>(CLOSED);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const config = snapshot?.config;
  const modes = config?.modes ?? [];
  const activeId = config?.activeMode ?? "";
  const activeMode = modes.find((mode) => mode.id === activeId) ?? modes[0];
  const editingMode = modeDialog.type === "edit" ? modes.find((m) => m.id === modeDialog.id) : undefined;
  const editingAction =
    actionDialog.type === "edit" ? activeMode?.actions.find((a) => a.id === actionDialog.id) : undefined;
  const writable = canWrite();

  /** Mostra o erro e devolve `true` quando a operação passou. */
  function report(result: MutationResult, success?: string): boolean {
    if (result) {
      push(errorText(result), "danger");
      return false;
    }
    if (success) push(success, "success");
    return true;
  }

  function errorText(error: DeckError): string {
    const detail = deckErrorDetail(error);
    const message = describeDeckError(t, error);
    return detail ? `${message} (${detail})` : message;
  }

  async function handleActivate(id: string): Promise<void> {
    const name = modes.find((m) => m.id === id)?.name ?? "";
    report(await activate(id), t("modes.activated", { name }));
  }

  async function submitMode(value: ModeFormValue): Promise<void> {
    if (modeDialog.type === "edit" && modeDialog.id) {
      if (report(await updateMode({ id: modeDialog.id, ...value }), t("modes.saved"))) closeModeDialog();
    } else if (report(await createMode(value), t("modes.created"))) {
      closeModeDialog();
    }
  }

  async function confirmDeleteMode(): Promise<void> {
    if (!deleteTarget) return;
    if (report(await deleteMode(deleteTarget), t("modes.deleted"))) setDeleteTarget(null);
  }

  async function submitAction(input: ActionInput): Promise<void> {
    if (!activeMode) return;
    const saved = report(
      await saveAction(activeMode.id, input),
      input.id ? t("actions.saved") : t("actions.created"),
    );
    if (saved) closeActionDialog();
  }

  async function removeAction(): Promise<void> {
    if (!activeMode || actionDialog.type !== "edit" || !actionDialog.id) return;
    if (report(await deleteAction(activeMode.id, actionDialog.id), t("actions.deleted"))) {
      closeActionDialog();
    }
  }

  async function reorder(call: () => Promise<MutationResult>): Promise<void> {
    report(await call());
  }

  const closeModeDialog = (): void => setModeDialog((d) => ({ ...d, open: false }));
  const closeActionDialog = (): void => setActionDialog((d) => ({ ...d, open: false }));

  const cards: ModeCardItem[] = modes.map((mode) => ({
    id: mode.id,
    label: mode.name,
    color: mode.color,
    active: mode.id === activeId,
    meta: t("modes.actionsCount", { count: mode.actions.length }),
  }));

  const takenKeys = [
    ...(config ? [config.general.modeKey] : []),
    ...(activeMode?.actions.filter((a) => a.id !== editingAction?.id).map((a) => a.key) ?? []),
  ];

  const deleteName = modes.find((m) => m.id === deleteTarget)?.name ?? "";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("modes.title")}
        description={t("modes.description")}
        actions={
            <Button
              variant="primary"
              disabled={!writable || modes.length >= MAX_MODES}
              onClick={() => setModeDialog({ open: true, type: "create" })}
            >
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
              {t("modes.newMode")}
            </Button>
        }
      />

      {!writable ? <Notice>{t("modes.browserNotice")}</Notice> : null}

      {!snapshot ? (
        <div className="flex min-h-[200px] items-center justify-center text-ink-3">
          <Loader2 aria-hidden="true" className="size-5 animate-spin" strokeWidth={2} />
        </div>
      ) : config && activeMode ? (
        <section className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ModeCardList
            items={cards}
            onSelect={(id) => void handleActivate(id)}
            onReorder={writable ? (ids) => reorder(() => reorderModes(ids)) : undefined}
            label={t("modes.title")}
          />

          <div
            role="tabpanel"
            id={`mode-panel-${activeId}`}
            aria-labelledby={`mode-tab-${activeId}`}
            tabIndex={0}
            className="card p-6"
          >
            <ModePanel
              mode={activeMode}
              modeKey={config.general.modeKey}
              writable={writable}
              onEdit={() => setModeDialog({ open: true, type: "edit", id: activeMode.id })}
              onDelete={() => setDeleteTarget(activeMode.id)}
            />

            <div className="mt-5 border-t border-line pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <div className="t-label">{t("modes.actionKeys")}</div>
                {activeMode.actions.length > 1 && writable ? (
                  <p className="t-small text-text-tertiary">{t("reorder.hint")}</p>
                ) : null}
              </div>
              <SortableList
                key={activeMode.id}
                items={activeMode.actions}
                layout="grid"
                label={(action) => action.label}
                disabled={!writable}
                onReorder={(ids) => reorder(() => reorderActions(activeMode.id, ids))}
                className="mt-3 grid gap-2 sm:grid-cols-3"
                trailing={
                  activeMode.actions.length < MAX_ACTIONS ? (
                    <button
                      type="button"
                      className="action-tile items-center justify-center gap-2 border-dashed text-ink-3 hover:text-ink"
                      disabled={!writable}
                      onClick={() => setActionDialog({ open: true, type: "create" })}
                    >
                      <Plus aria-hidden="true" className="size-4" strokeWidth={1.8} />
                      <span className="t-small">{t("actions.add")}</span>
                    </button>
                  ) : null
                }
              >
                {(action, drag) => (
                  <ActionTile
                    action={action}
                    disabled={!writable}
                    drag={drag}
                    onEdit={() => setActionDialog({ open: true, type: "edit", id: action.id })}
                  />
                )}
              </SortableList>
            </div>
          </div>
        </section>
      ) : (
        <Notice>{t("modes.loadError")}</Notice>
      )}

      <ModeDialog
        open={modeDialog.open}
        onOpenChange={(open) => !open && closeModeDialog()}
        initial={
          modeDialog.type === "edit" && editingMode
            ? { name: editingMode.name, color: editingMode.color, layout: editingMode.layout, columns: editingMode.columns }
            : null
        }
        onSubmit={submitMode}
      />

      <ActionDialog
        open={actionDialog.open}
        onOpenChange={(open) => !open && closeActionDialog()}
        initial={editingAction ?? null}
        takenKeys={takenKeys}
        onSubmit={submitAction}
        onDelete={removeAction}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t("modes.deleteTitle", { name: deleteName })}
        description={t("modes.deleteBody")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("modes.deleteCancel")}
            </Button>
            <Button variant="danger" onClick={() => void confirmDeleteMode()}>
              {t("modes.deleteConfirm")}
            </Button>
          </>
        }
      >
        <span className="sr-only">{deleteName}</span>
      </Dialog>
    </div>
  );
}

interface ModePanelProps {
  mode: Mode;
  modeKey: string;
  writable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function ModePanel({ mode, modeKey, writable, onEdit, onDelete }: ModePanelProps) {
  const { t } = useTranslation();

  return (
    <div key={mode.id} className="mode-panel-enter flex flex-col gap-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <ModeDot color={mode.color} />
            <h2 className="t-h1 truncate text-text-primary">{mode.name}</h2>
            <SuccessCheck show label={t("modes.active")} size={14} className="text-accent-amber" />
          </div>
          <p className="t-small mt-1 text-text-secondary">
            {t("modes.actionsCount", { count: mode.actions.length })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" iconOnly disabled={!writable} onClick={onEdit} aria-label={t("modes.edit")}>
            <Pencil aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          </Button>
          <Button variant="ghost" size="sm" iconOnly disabled={!writable} onClick={onDelete} aria-label={t("modes.delete")}>
            <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
          </Button>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 border-t border-line pt-4">
        <div>
          <dt className="t-label">{t("modes.modeKey")}</dt>
          <dd className="mt-1.5">
            <Keycap tone="mode">{formatKey(modeKey)}</Keycap>
          </dd>
        </div>
        <div>
          <dt className="t-label">{t("modes.columnsLabel")}</dt>
          <dd className="t-h2 mt-1.5">{mode.columns === 0 ? t("modes.columnsAuto") : mode.columns}</dd>
        </div>
      </dl>
    </div>
  );
}

interface ActionTileProps {
  action: Action;
  disabled: boolean;
  drag: SortableItemState;
  onEdit: () => void;
}

function ActionTile({ action, disabled, drag, onEdit }: ActionTileProps) {
  const { t } = useTranslation();
  const Icon = kindIcons[action.payload.kind] ?? ChevronRight;
  const { attach, handleProps, overlay, justDragged } = drag;

  return (
    <button
      ref={attach as Ref<HTMLButtonElement> | undefined}
      type="button"
      className="action-tile relative w-full text-left"
      disabled={disabled}
      data-sortable-handle=""
      {...handleProps}
      onClick={() => {
        if (!justDragged()) onEdit();
      }}
      aria-label={`${t("actions.editTitle")}: ${action.label}`}
    >
      {disabled || overlay ? null : (
        <GripHorizontal aria-hidden="true" className="grip-hint size-3.5" strokeWidth={1.8} />
      )}
      <div className="flex items-center justify-between gap-2">
        <Keycap>{formatKey(action.key)}</Keycap>
        <Icon aria-hidden="true" className="size-3.5 text-ink-3" strokeWidth={1.7} />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium tracking-[-0.005em] text-text-primary">
          {action.label}
        </div>
        <div className="mt-0.5 font-mono text-xs text-text-tertiary">
          {t(`modes.kinds.${action.payload.kind}`)}
        </div>
      </div>
    </button>
  );
}
