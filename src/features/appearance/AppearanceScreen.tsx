import { useTranslation } from "react-i18next";
import { Field } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseChip } from "@/components/ui/PhaseChip";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { modeColors } from "@/lib/preview-data";
import { useTheme } from "@/theme/ThemeProvider";

export function AppearanceScreen() {
  const { t } = useTranslation();
  const { mode, motion, setMode, setMotion } = useTheme();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("appearance.title")} description={t("appearance.description")} />

      <section className="card divide-y divide-line px-5">
        <Field
          title={t("appearance.themeTitle")}
          description={t("appearance.themeDescription")}
          control={
            <Segmented
              label={t("appearance.themeTitle")}
              value={mode}
              onChange={setMode}
              options={[
                { value: "system", label: t("appearance.themeSystem") },
                { value: "light", label: t("appearance.themeLight") },
                { value: "dark", label: t("appearance.themeDark") },
              ]}
            />
          }
        />

        <Field
          title={t("appearance.motionTitle")}
          description={t("appearance.motionDescription")}
          htmlFor="reduce-motion"
          control={
            <Switch
              id="reduce-motion"
              checked={motion === "reduced"}
              onCheckedChange={(checked) => setMotion(checked ? "reduced" : "full")}
            />
          }
        />

        <Field
          title={t("appearance.overlayTitle")}
          description={t("appearance.overlayDescription")}
          control={<PhaseChip>Fase 6</PhaseChip>}
        />
      </section>

      <section className="card p-5">
        <h2 className="t-h2">{t("appearance.paletteTitle")}</h2>
        <p className="t-small mt-1 max-w-[62ch] text-ink-2">{t("appearance.paletteDescription")}</p>
        <ul aria-hidden="true" className="mt-4 flex flex-wrap gap-2">
          {modeColors.map((color) => (
            <li
              key={color}
              className="size-6 rounded-full border border-line"
              style={{ backgroundColor: color }}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
