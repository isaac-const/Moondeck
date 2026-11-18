import { useTranslation } from "react-i18next";
import { AppIcon } from "@/components/ui/AppIcon";
import { PageHeader } from "@/components/ui/PageHeader";
import { useRuntimeInfo } from "@/lib/use-runtime-info";

export function AboutScreen() {
  const { t } = useTranslation();
  const runtime = useRuntimeInfo();

  const rows: ReadonlyArray<{ label: string; value: string }> = [
    { label: t("about.version"), value: runtime.version },
    { label: t("about.stack"), value: t("about.stackValue") },
    { label: t("about.license"), value: t("about.licenseValue") },
    { label: t("about.repository"), value: "github.com/isaac-const/Moondeck" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("about.title")} description={t("about.description")} />

      <section className="card p-5">
        <div className="flex items-center gap-3">
          <AppIcon size={44} className="shrink-0" />
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-[-0.015em]">MoonDeck</div>
            <p className="t-small text-ink-2">{t("about.tagline")}</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-line border-t border-line">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-6 py-3">
              <dt className="t-label">{row.label}</dt>
              <dd className="t-mono text-ink-2">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
