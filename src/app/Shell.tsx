import { Onboarding } from "@/features/onboarding/Onboarding";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastHost } from "@/components/ui/Toast";
import { useToastStore } from "@/components/ui/toast-store";
import { listen } from "@tauri-apps/api/event";
import { useEngineStore } from "@/features/deck/engine";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";
import { AboutScreen } from "@/features/about/AboutScreen";
import { AppearanceScreen } from "@/features/appearance/AppearanceScreen";
import { AudioScreen } from "@/features/audio/AudioScreen";
import { GeneralScreen } from "@/features/general/GeneralScreen";
import { KeysScreen } from "@/features/keys/KeysScreen";
import { ModesScreen } from "@/features/modes/ModesScreen";
import { views, type View } from "./views";

/** Em dev, `?view=appearance` abre direto a tela — útil para revisar e capturar. */
function initialView(): View {
  if (!import.meta.env.DEV) return "modes";
  const requested = new URLSearchParams(window.location.search).get("view");
  const match = views.find((view) => view === requested);
  return match ?? "modes";
}

export function Shell() {
  const { t, i18n } = useTranslation();
  const [view, setView] = useState<View>(initialView);
  const toast = useToastStore((s) => s.message);
  const dismissToast = useToastStore((s) => s.dismiss);
  const push = useToastStore((s) => s.push);
  const loadEngine = useEngineStore((s) => s.load);
  const failure = useEngineStore((s) => s.failure);
  const clearFailure = useEngineStore((s) => s.clearFailure);

  useEffect(() => {
    void loadEngine();
  }, [loadEngine]);

  // O menu da bandeja (feito no Rust) segue o idioma da interface.
  useEffect(() => {
    if (isTauri()) void commands.trayLanguage(i18n.language);
  }, [i18n.language]);

  // O overlay pede para abrir uma tela (ex.: engrenagem → Modos).
  useEffect(() => {
    if (!isTauri()) return;
    let off: (() => void) | undefined;
    let disposed = false;
    void listen<string>("app://navigate", (event) => {
      const match = views.find((candidate) => candidate === event.payload);
      if (match) setView(match);
    }).then((fn) => {
      if (disposed) fn();
      else off = fn;
    });
    return () => {
      disposed = true;
      off?.();
    };
  }, []);

  // Uma ação disparada por tecla falhou (arquivo sumiu, ydotool ausente…).
  useEffect(() => {
    if (!failure) return;
    push(`${t("actions.failed", { label: failure.label })} ${failure.error ?? ""}`.trim(), "danger");
    clearFailure();
  }, [failure, push, clearFailure, t]);

  return (
    <div className="flex h-full">
      <a className="skip-link" href="#main">
        {t("nav.skipToContent")}
      </a>

      <Sidebar current={view} onSelect={setView} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* `key` remonta a tela: foco e estado de cada seção não vazam. */}
        <main id="main" key={view} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[900px] px-8 py-7">
            <Screen view={view} />
          </div>
        </main>
      </div>

      <Onboarding />
      <ToastHost message={toast} onDismiss={dismissToast} />
    </div>
  );
}

function Screen({ view }: { view: View }) {
  switch (view) {
    case "modes":
      return <ModesScreen />;
    case "keys":
      return <KeysScreen />;
    case "appearance":
      return <AppearanceScreen />;
    case "audio":
      return <AudioScreen />;
    case "general":
      return <GeneralScreen />;
    case "about":
      return <AboutScreen />;
  }
}
