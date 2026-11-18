import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { EngineStatusPill } from "@/components/ui/EngineStatusPill";
import { Field } from "@/components/ui/Field";
import { KeyCapture } from "@/components/ui/KeyCapture";
import { Keycap } from "@/components/ui/Keycap";
import { ModeDot } from "@/components/ui/ModeDot";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Switch } from "@/components/ui/Switch";
import { useToastStore } from "@/components/ui/toast-store";
import { useEngineStore } from "@/features/deck/engine";
import { describeDeckError } from "@/features/deck/errors";
import { formatKey, sameKey } from "@/features/deck/keys";
import { canWrite, useDeckStore } from "@/features/deck/store";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import type { ModeColor } from "@/lib/types";

interface KeyUse {
  key: string;
  isModeKey: boolean;
  uses: Array<{ mode: string; color: ModeColor; action: string }>;
}

export function KeysScreen() {
  const { t } = useTranslation();
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const saveGeneral = useDeckStore((s) => s.saveGeneral);
  const engine = useEngineStore((s) => s.status);
  const loadEngine = useEngineStore((s) => s.load);
  const retry = useEngineStore((s) => s.retry);
  const push = useToastStore((s) => s.push);

  const [macropads, setMacropads] = useState<string[]>([]);

  useEffect(() => {
    void load();
    void loadEngine();
  }, [load, loadEngine]);

  // Macropads conectados (só o Linux informa): vale uma dica de quais teclas usar.
  useEffect(() => {
    if (!isTauri()) return;
    let active = true;
    void commands.inputDevices().then((devices) => {
      if (active) setMacropads(devices.filter((device) => device.macropad).map((device) => device.name));
    });
    return () => {
      active = false;
    };
  }, []);

  const config = snapshot?.config;
  const writable = canWrite();

  async function save(next: NonNullable<typeof config>["general"]): Promise<void> {
    const error = await saveGeneral(next);
    if (error) push(describeDeckError(t, error), "danger");
  }

  const uses: KeyUse[] = [];
  if (config) {
    uses.push({ key: config.general.modeKey, isModeKey: true, uses: [] });
    for (const mode of config.modes) {
      for (const action of mode.actions) {
        let entry = uses.find((item) => sameKey(item.key, action.key));
        if (!entry) {
          entry = { key: action.key, isModeKey: false, uses: [] };
          uses.push(entry);
        }
        entry.uses.push({ mode: mode.name, color: mode.color, action: action.label });
      }
    }
  }

  const otherKeys = config
    ? config.modes.flatMap((mode) => mode.actions.map((action) => action.key))
    : [];
  const modeKeyConflict =
    config && otherKeys.some((key) => sameKey(key, config.general.modeKey))
      ? t("errors.general.modeKeyInActionKeys")
      : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={t("keys.title")}
        description={t("keys.description")}
        actions={<EngineStatusPill />}
      />

      {!writable ? <Notice>{t("modes.browserNotice")}</Notice> : null}

      {macropads.length > 0 ? (
        <Notice>{t("keys.macropadFound", { names: macropads.join(", ") })}</Notice>
      ) : null}

      {config ? (
        <>
          <section className="card divide-y divide-line px-5">
            <Field
              title={t("keys.modeKeyTitle")}
              description={t("keys.modeKeyDescription")}
              control={
                <KeyCapture
                  className="items-end"
                  value={config.general.modeKey}
                  error={modeKeyConflict}
                  onChange={(key) => void save({ ...config.general, modeKey: key })}
                />
              }
            />
            <Field
              title={t("keys.captureTitle")}
              description={t("keys.captureDescription")}
              htmlFor="capture-enabled"
              control={
                <Switch
                  id="capture-enabled"
                  disabled={!writable}
                  checked={config.general.captureEnabled}
                  onCheckedChange={(checked) =>
                    void save({ ...config.general, captureEnabled: checked })
                  }
                />
              }
            />
          </section>

          {engine?.error ? (
            <Notice>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{engine.error}</span>
                <Button size="sm" variant="secondary" onClick={() => void retry()}>
                  <RefreshCw aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  {t("keys.retry")}
                </Button>
              </div>
            </Notice>
          ) : null}

          <section className="card p-5">
            <h2 className="t-h2">{t("keys.inUseTitle")}</h2>
            {uses.length <= 1 && uses[0]?.uses.length === 0 ? (
              <p className="t-small mt-2 text-text-secondary">{t("keys.inUseEmpty")}</p>
            ) : null}
            <ul className="mt-4 flex flex-col divide-y divide-line">
              {uses.map((entry) => (
                <li key={entry.key} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                  <Keycap tone={entry.isModeKey ? "mode" : "default"} className="shrink-0">
                    {formatKey(entry.key)}
                  </Keycap>
                  <div className="min-w-0 pt-1">
                    {entry.isModeKey ? (
                      <span className="font-mono text-xs text-text-tertiary">{t("keys.modeKeyBadge")}</span>
                    ) : null}
                    {entry.uses.map((use) => (
                      <div key={`${use.mode}-${use.action}`} className="flex items-center gap-2 t-small">
                        <ModeDot color={use.color} size="sm" />
                        <span className="text-text-secondary">{use.mode}</span>
                        <span className="text-text-tertiary">→</span>
                        <span className="truncate text-text-primary">{use.action}</span>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <p className="t-small mt-4 text-text-tertiary">{t("keys.portalNote")}</p>
          </section>
        </>
      ) : null}
    </div>
  );
}
