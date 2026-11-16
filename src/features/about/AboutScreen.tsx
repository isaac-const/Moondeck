import { useTranslation } from "react-i18next";
import { BrandMark } from "@/components/ui/BrandMark";
import { PageHeader } from "@/components/ui/PageHeader";
import { useRuntimeInfo } from "@/lib/use-runtime-info";

export function AboutScreen() {
  const { t } = useTranslation();
  const runtime = useRuntimeInfo();

  const rows: ReadonlyArray<{ label: string; value: string; muted?: boolean }> = [
    { label: t("about.version"), value: runtime.version },
    { label: t("about.stack"), value: t("about.stackValue") },
    { label: t("about.license"), value: t("about.licenseValue") },
    { label: t("about.repository"), value: t("about.repositoryPending"), muted: true },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title={t("about.title")} description={t("about.description")} />

      <section className="card p-5">
        <div className="flex items-center gap-3">
          <BrandMark size={30} className="shrink-0 text-ink" />
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-[-0.015em]">MoonDeck</div>
            <p className="t-small text-ink-2">{t("about.tagline")}</p>
          </div>
        </div>

        <dl className="mt-6 divide-y divide-line border-t border-line">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-6 py-3">
              <dt className="t-label">{row.label}</dt>
              <dd className={row.muted ? "t-mono text-ink-3" : "t-mono text-ink-2"}>{row.value}</dd>
            </div>
          ))}
        </dl>

        <p className="t-small mt-4 text-ink-3">{t("about.licenseNote")}</p>
      </section>
    </div>
  );
}
