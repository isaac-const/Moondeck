import { useTranslation } from "react-i18next";
import { Field } from "@/components/ui/Field";
import { Keycap } from "@/components/ui/Keycap";
import { PageHeader } from "@/components/ui/PageHeader";
import { PhaseChip } from "@/components/ui/PhaseChip";
import { Segmented } from "@/components/ui/Segmented";
import { Switch } from "@/components/ui/Switch";
import { isLocale, type Locale } from "@/i18n";

export function GeneralScreen() {
  const { t, i18n } = useTranslation();
  const current: Locale = isLocale(i18n.language) ? i18n.language : "en";

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

        <Field
          title={t("general.autostartTitle")}
          description={t("general.autostartDescription")}
          htmlFor="autostart"
          control={
            <>
              <PhaseChip>Fase 8</PhaseChip>
              <Switch id="autostart" disabled checked={false} />
            </>
          }
        />

        <Field
          title={t("general.emergencyTitle")}
          description={t("general.emergencyDescription")}
          control={
            <>
              <PhaseChip>Fase 8</PhaseChip>
              <Keycap tone="ghost">—</Keycap>
            </>
          }
        />
      </section>
    </div>
  );
}
