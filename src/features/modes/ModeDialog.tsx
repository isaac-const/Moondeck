import { Check, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/cn";
import { MAX_MODE_NAME } from "@/features/deck/limits";
import type { LayoutPreset, ModeColor } from "@/lib/types";

const palette: readonly ModeColor[] = ["sky", "sage", "teal", "slate", "rose", "clay", "sand", "ash"];
const columnChoices: readonly number[] = [0, 1, 2, 3, 4];

export interface ModeFormValue {
  name: string;
  color: ModeColor;
  layout: LayoutPreset;
  /** 0 = automático. */
  columns: number;
}

export interface ModeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar. */
  initial: ModeFormValue | null;
  onSubmit: (value: ModeFormValue) => Promise<void>;
}

/** Criar e editar modo: o mesmo modal, o título e o botão mudam. */
export function ModeDialog({ open, onOpenChange, initial, onSubmit }: ModeDialogProps) {
  const { t } = useTranslation();
  const creating = initial === null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={creating ? t("modes.createTitle") : t("modes.editTitle")}
      description={creating ? t("modes.createDescription") : undefined}
    >
      {/* O conteúdo do modal só existe enquanto ele está aberto: o estado do
          formulário nasce limpo a cada abertura, sem efeito de reset. */}
      <ModeForm initial={initial} onSubmit={onSubmit} onCancel={() => onOpenChange(false)} />
    </Dialog>
  );
}

interface ModeFormProps {
  initial: ModeFormValue | null;
  onSubmit: (value: ModeFormValue) => Promise<void>;
  onCancel: () => void;
}

function ModeForm({ initial, onSubmit, onCancel }: ModeFormProps) {
  const { t } = useTranslation();
  const creating = initial === null;
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState<ModeColor>(initial?.color ?? "sage");
  const [columns, setColumns] = useState<number>(initial?.columns ?? 0);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), color, layout: initial?.layout ?? "grid", columns });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
        <div>
          <label htmlFor="mode-name" className="t-label block">
            {t("modes.nameLabel")}
          </label>
          <input
            id="mode-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("modes.namePlaceholder")}
            maxLength={MAX_MODE_NAME}
            className="input mt-1.5 w-full"
            autoComplete="off"
          />
          <p className="t-mono mt-1 text-ink-3">
            {name.length}/{MAX_MODE_NAME}
          </p>
        </div>

        <div>
          <span className="t-label block">{t("modes.colorLabel")}</span>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("modes.colorLabel")}>
            {palette.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={color === option}
                aria-label={t(`modes.colors.${option}`)}
                className="mode-swatch"
                style={{ backgroundColor: `var(--mode-${option})` }}
                onClick={() => setColor(option)}
              >
                <Check
                  aria-hidden="true"
                  className={cn("size-3.5 text-black/70 transition-opacity", color === option ? "opacity-100" : "opacity-0")}
                  strokeWidth={2.5}
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="t-label block">{t("modes.columnsLabel")}</span>
          <Segmented<string>
            className="mt-2"
            label={t("modes.columnsLabel")}
            value={String(columns)}
            onChange={(value) => setColumns(Number(value))}
            options={columnChoices.map((option) => ({
              value: String(option),
              label: option === 0 ? t("modes.columnsAuto") : String(option),
            }))}
          />
          <p className="t-body mt-1.5 text-ink-3">{t("modes.columnsHint")}</p>
        </div>

        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {t("modes.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>
            {busy ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={2} /> : null}
            {creating ? t("modes.create") : t("modes.save")}
          </Button>
        </div>
    </form>
  );
}
