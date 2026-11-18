import { open as openFile, save as saveFile } from "@tauri-apps/plugin-dialog";
import { Download, LogOut, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { useToastStore } from "@/components/ui/toast-store";
import { describeDeckError } from "@/features/deck/errors";
import { canWrite, useDeckStore } from "@/features/deck/store";
import { isLocale, type Locale } from "@/i18n";
import { commands } from "@/lib/bindings";
import { useTutorialStore } from "@/features/onboarding/store";
import { isTauri } from "@/lib/runtime";
import type { General } from "@/lib/types";

export function GeneralScreen() {
  const { t, i18n } = useTranslation();
  const current: Locale = isLocale(i18n.language) ? i18n.language : "en";
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const saveGeneral = useDeckStore((s) => s.saveGeneral);
  const importDeckFile = useDeckStore((s) => s.importDeck);
  const push = useToastStore((s) => s.push);
  const showTutorial = useTutorialStore((s) => s.show);
  // `null` = ainda perguntando. Fora do Tauri não há bandeja nem o que sair.
  const [trayAvailable, setTrayAvailable] = useState<boolean | null>(isTauri() ? null : false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void commands.appTrayAvailable().then((available) => {
      if (!cancelled) setTrayAvailable(available);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const general = snapshot?.config.general;
  const writable = canWrite();

  const [confirmImport, setConfirmImport] = useState(false);

  async function exportDeck(): Promise<void> {
    const path = await saveFile({
      defaultPath: "moondeck.json",
      filters: [{ name: t("general.jsonFiles"), extensions: ["json"] }],
    });
    if (!path) return;
    try {
      await commands.deckExport(path);
      push(t("general.exportDone"), "success");
    } catch (cause) {
      push(describeDeckError(t, cause as never), "danger");
    }
  }

  async function importDeck(): Promise<void> {
    const chosen = await openFile({
      multiple: false,
      directory: false,
      filters: [{ name: t("general.jsonFiles"), extensions: ["json"] }],
    });
    setConfirmImport(false);
    if (typeof chosen !== "string") return;
    const error = await importDeckFile(chosen);
    if (error) push(describeDeckError(t, error), "danger");
    else push(t("general.importDone"), "success");
  }

  async function save(patch: Partial<General>): Promise<void> {
    if (!general) return;
    const error = await saveGeneral({ ...general, ...patch });
    if (error) push(describeDeckError(t, error), "danger");
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("general.title")} description={t("general.description")} />

      <section className="card divide-y divide-line px-5">
        <Field
          title={t("general.languageTitle")}
          description={t("general.languageDescription")}
          control={
            <Segmented<Locale>
              label={t("general.languageTitle")}
              value={current}
              onChange={(locale) => {
                void i18n.changeLanguage(locale);
              }}
              options={[
                { value: "pt-BR", label: "PT-BR" },
                { value: "en", label: "EN" },
              ]}
            />
          }
        />
      </section>

      {isTauri() ? (
        <section className="flex flex-col gap-3">
          <h2 className="t-label">{t("general.dataTitle")}</h2>
          <div className="card divide-y divide-line px-5">
            <Field
              title={t("general.exportTitle")}
              description={t("general.exportDescription")}
              control={
                <Button variant="secondary" onClick={() => void exportDeck()}>
                  <Download aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  {t("general.exportAction")}
                </Button>
              }
            />
            <Field
              title={t("general.importTitle")}
              description={t("general.importDescription")}
              control={
                confirmImport ? (
                  <div className="flex items-center gap-2">
                    <span className="t-small text-text-secondary">{t("general.importConfirm")}</span>
                    <Button variant="ghost" onClick={() => setConfirmImport(false)}>
                      {t("modes.cancel")}
                    </Button>
                    <Button variant="danger" onClick={() => void importDeck()}>
                      {t("general.importConfirmAction")}
                    </Button>
                  </div>
                ) : (
                  <Button variant="secondary" disabled={!writable} onClick={() => setConfirmImport(true)}>
                    <Upload aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                    {t("general.importAction")}
                  </Button>
                )
              }
            />
          </div>
        </section>
      ) : null}

      {general ? (
        <section className="flex flex-col gap-3">
          <h2 className="t-label">{t("general.systemTitle")}</h2>
          {trayAvailable === false && isTauri() ? <Notice>{t("general.noTray")}</Notice> : null}
          <div className="card divide-y divide-line px-5">
            <Field
              htmlFor="close-to-tray"
              title={t("general.closeToTrayTitle")}
              description={t("general.closeToTrayDescription")}
              control={
                <Switch
                  id="close-to-tray"
                  checked={general.closeToTray && trayAvailable !== false}
                  disabled={!writable || trayAvailable === false}
                  onCheckedChange={(closeToTray) => void save({ closeToTray })}
                />
              }
            />
            <Field
              htmlFor="start-on-boot"
              title={t("general.startOnBootTitle")}
              description={t("general.startOnBootDescription")}
              control={
                <Switch
                  id="start-on-boot"
                  checked={general.startOnBoot}
                  disabled={!writable}
                  onCheckedChange={(startOnBoot) => void save({ startOnBoot })}
                />
              }
            />
            <Field
              htmlFor="start-minimized"
              title={t("general.startMinimizedTitle")}
              description={t("general.startMinimizedDescription")}
              control={
                <Switch
                  id="start-minimized"
                  checked={general.startMinimized && trayAvailable !== false}
                  disabled={!writable || !general.startOnBoot || trayAvailable === false}
                  onCheckedChange={(startMinimized) => void save({ startMinimized })}
                />
              }
            />
            <Field
              title={t("general.tutorialTitle")}
              description={t("general.tutorialDescription")}
              control={
                <Button variant="secondary" onClick={showTutorial}>
                  {t("general.tutorialAction")}
                </Button>
              }
            />
            {isTauri() ? (
              <Field
                title={t("general.quitTitle")}
                description={t("general.quitDescription")}
                control={
                  <Button variant="ghost" onClick={() => void commands.appQuit()}>
                    <LogOut aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                    {t("general.quitAction")}
                  </Button>
                }
              />
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
