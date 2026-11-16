import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
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
  const { t } = useTranslation();
  const [view, setView] = useState<View>(initialView);

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
        <StatusBar />
      </div>
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
