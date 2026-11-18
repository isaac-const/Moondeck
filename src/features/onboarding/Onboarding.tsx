import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Keycap } from "@/components/ui/Keycap";
import { canWrite, useDeckStore } from "@/features/deck/store";
import { cn } from "@/lib/cn";
import { usePlatformCaps } from "@/lib/use-platform-caps";
import { useTutorialStore } from "./store";

const STEPS = ["welcome", "modeKey", "modes", "look", "system", "done"] as const;
type Step = (typeof STEPS)[number];

function Illustration({ step }: { step: Step }) {
  const { t } = useTranslation();
  switch (step) {
    case "welcome":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {["Home", "PgUp", "PgDn", "End", "F13"].map((key) => (
            <Keycap key={key}>{key}</Keycap>
          ))}
        </div>
      );
    case "modeKey":
      return (
        <ul className="flex flex-col gap-2.5">
          {(["tap", "again", "hold"] as const).map((gesture) => (
            <li key={gesture} className="flex items-center gap-3">
              <Keycap tone="mode" className="shrink-0">
                Home
              </Keycap>
              <span className="t-small text-text-secondary">{t(`onboarding.gesture.${gesture}`)}</span>
            </li>
          ))}
        </ul>
      );
    case "modes":
      return (
        <ul className="flex flex-wrap gap-1.5">
          {(["sound", "shortcut", "macro", "voice", "app"] as const).map((kind) => (
            <li key={kind} className="rounded-full border border-line px-3 py-1 text-xs text-text-secondary">
              {t(`modes.kinds.${kind}`)}
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

/** Tutorial de primeira abertura. Também abre quando o usuário pede (Geral → Rever tutorial). */
export function Onboarding() {
  const { t } = useTranslation();
  const caps = usePlatformCaps();
  const open = useTutorialStore((s) => s.open);
  const show = useTutorialStore((s) => s.show);
  const hide = useTutorialStore((s) => s.hide);
  const snapshot = useDeckStore((s) => s.snapshot);
  const load = useDeckStore((s) => s.load);
  const saveGeneral = useDeckStore((s) => s.saveGeneral);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    void load();
  }, [load]);

  const general = snapshot?.config.general;
  const firstRun = general ? !general.onboardingDone : false;
  useEffect(() => {
    if (firstRun && canWrite()) show();
  }, [firstRun, show]);

  const step = STEPS[index] ?? "welcome";
  const last = index === STEPS.length - 1;

  async function finish(): Promise<void> {
    hide();
    setIndex(0);
    if (general && !general.onboardingDone) await saveGeneral({ ...general, onboardingDone: true });
  }

  const systemNote =
    caps.os === "windows"
      ? t("onboarding.system.windows")
      : caps.os === "macos"
        ? t("onboarding.system.macos")
        : t("onboarding.system.linux");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void finish();
      }}
      title={t(`onboarding.${step}.title`)}
      className="max-w-[520px]"
      footer={
        <>
          {!last ? (
            <Button variant="ghost" onClick={() => void finish()}>
              {t("onboarding.skip")}
            </Button>
          ) : null}
          {index > 0 ? (
            <Button variant="secondary" onClick={() => setIndex(index - 1)}>
              {t("onboarding.back")}
            </Button>
          ) : null}
          <Button variant="primary" onClick={() => (last ? void finish() : setIndex(index + 1))}>
            {last ? t("onboarding.start") : t("onboarding.next")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="t-body text-text-secondary">{t(`onboarding.${step}.body`)}</p>
        <Illustration step={step} />
        {step === "system" ? <p className="t-small text-text-secondary">{systemNote}</p> : null}
        <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
          {STEPS.map((name, position) => (
            <span
              key={name}
              className={cn("h-1 rounded-full transition-all", position === index ? "w-5 bg-text-primary" : "w-1.5 bg-line-strong")}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
