import { AppWindow, ChevronRight, Command, Music, Plus, type LucideIcon } from "lucide-react";
import { useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Keycap } from "@/components/ui/Keycap";
import { ModeDot } from "@/components/ui/ModeDot";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseChip } from "@/components/ui/PhaseChip";
import { cn } from "@/lib/cn";
import { previewModes, type ActionKind, type PreviewAction } from "@/lib/preview-data";

const kindIcons: Record<ActionKind, LucideIcon> = {
  sound: Music,
  shortcut: Command,
  app: AppWindow,
};

export function ModesScreen() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState(previewModes[0]?.id ?? "");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const selected = previewModes.find((mode) => mode.id === selectedId) ?? previewModes[0];

  function moveFocus(from: number, delta: number): void {
    if (previewModes.length === 0) return;
    const next = (from + delta + previewModes.length) % previewModes.length;
    const mode = previewModes[next];
    if (!mode) return;
    setSelectedId(mode.id);
    tabs.current[next]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLElement>, index: number): void {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      moveFocus(index, -1);
    } else if (event.key === "Home") {
      event.preventDefault();
      moveFocus(previewModes.length - 1, 1);
    } else if (event.key === "End") {
      event.preventDefault();
      moveFocus(0, -1);
    }
  }

  if (!selected) return null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("modes.title")}
        description={t("modes.description")}
        actions={
          <>
            <PhaseChip>Fase 5</PhaseChip>
            <Button variant="secondary" disabled>
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
              {t("modes.newMode")}
            </Button>
          </>
        }
      />

      <Notice>{t("modes.notice")}</Notice>

      <section className="card grid overflow-hidden lg:grid-cols-[232px_minmax(0,1fr)]">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t("modes.title")}
          className="flex flex-col gap-0.5 border-b border-line p-1.5 lg:border-b-0 lg:border-r"
        >
          {previewModes.map((mode, index) => {
            const active = mode.id === selected.id;
            return (
              <button
                key={mode.id}
                ref={(node) => {
                  tabs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`mode-tab-${mode.id}`}
                aria-selected={active}
                aria-controls={`mode-panel-${mode.id}`}
                tabIndex={active ? 0 : -1}
                data-selected={active}
                className="mode-row"
                onClick={() => setSelectedId(mode.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <ModeDot color={mode.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">
                    {t(`modes.names.${mode.nameKey}`)}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-3">
                    {t("modes.actionsCount", { count: mode.actions.length })}
                  </span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0", active ? "text-ink-2" : "text-ink-3")}
                  strokeWidth={1.8}
                />
              </button>
            );
          })}
        </div>

        <div
          role="tabpanel"
          id={`mode-panel-${selected.id}`}
          aria-labelledby={`mode-tab-${selected.id}`}
          tabIndex={0}
          className="p-6"
        >
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <ModeDot color={selected.color} />
                <h2 className="t-display truncate">{t(`modes.names.${selected.nameKey}`)}</h2>
              </div>
              <p className="t-small mt-1 text-ink-2">
                {t("modes.actionsCount", { count: selected.actions.length })}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <div className="t-label">{t("modes.modeKey")}</div>
              <Keycap tone="mode" className="mt-1.5">
                {selected.modeKey}
              </Keycap>
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-5">
            <div className="t-label">{t("modes.actionKeys")}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {selected.actions.map((action) => (
                <ActionTile key={action.key} action={action} />
              ))}
            </div>
          </div>
        </div>
      </section>

      <KeysCluster />
    </div>
  );
}

interface ActionTileProps {
  action: PreviewAction;
}

function ActionTile({ action }: ActionTileProps) {
  const { t } = useTranslation();
  const Icon = kindIcons[action.kind];

  return (
    <div className="action-tile">
      <div className="flex items-center justify-between gap-2">
        <Keycap size="sm">{action.key}</Keycap>
        <Icon aria-hidden="true" className="size-3.5 text-ink-3" strokeWidth={1.7} />
      </div>
      <div>
        <div className="text-[13px] font-medium tracking-[-0.005em]">
          {t(`modes.actions.${action.labelKey}`)}
        </div>
        <div className="t-mono mt-0.5 text-ink-3">{action.detail}</div>
      </div>
    </div>
  );
}

/**
 * O cluster de navegação real de um teclado 75%. Mostrar as teclas físicas
 * explica o produto melhor que qualquer parágrafo: são teclas que o usuário
 * já tem e não usa.
 */
function KeysCluster() {
  const { t } = useTranslation();

  const keys: ReadonlyArray<{ label: string; tone: "mode" | "default" | "ghost" }> = [
    { label: "Ins", tone: "ghost" },
    { label: "Home", tone: "mode" },
    { label: "PgUp", tone: "default" },
    { label: "Del", tone: "ghost" },
    { label: "End", tone: "default" },
    { label: "PgDn", tone: "default" },
  ];

  return (
    <section className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-[54ch]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="t-h2">{t("modes.clusterTitle")}</h2>
          <PhaseChip>Fase 5</PhaseChip>
        </div>
        <p className="t-small mt-1 text-ink-2">{t("modes.clusterBody")}</p>
      </div>

      <div
        role="group"
        aria-label={t("modes.clusterLabel")}
        className="grid w-fit shrink-0 grid-cols-3 gap-1.5"
      >
        {keys.map((key) => (
          <Keycap key={key.label} tone={key.tone}>
            {key.label}
          </Keycap>
        ))}
      </div>
    </section>
  );
}
