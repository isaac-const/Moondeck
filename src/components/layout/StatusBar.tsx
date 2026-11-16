import { useTranslation } from "react-i18next";
import { useRuntimeInfo } from "@/lib/use-runtime-info";

export function StatusBar() {
  const { t } = useTranslation();
  const runtime = useRuntimeInfo();

  const platformLabel = runtime.platform
    ? [runtime.platform, runtime.arch].filter(Boolean).join(" · ")
    : "browser preview";

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-line px-4">
      <span className="t-label">
        {t("common.appName")} {runtime.version} · {t("common.phase")}
      </span>
      <span className="t-label">{platformLabel}</span>
    </footer>
  );
}
