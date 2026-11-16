import {
  Contrast,
  Info,
  Keyboard,
  Layers,
  Moon,
  Settings2,
  Sun,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/ui/BrandMark";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTheme } from "@/theme/ThemeProvider";
import type { View } from "@/app/views";

interface NavEntry {
  view: View;
  icon: LucideIcon;
  labelKey: "modes" | "keys" | "appearance" | "audio" | "general" | "about";
}

const navEntries: readonly NavEntry[] = [
  { view: "modes", icon: Layers, labelKey: "modes" },
  { view: "keys", icon: Keyboard, labelKey: "keys" },
  { view: "appearance", icon: Contrast, labelKey: "appearance" },
  { view: "audio", icon: Volume2, labelKey: "audio" },
  { view: "general", icon: Settings2, labelKey: "general" },
  { view: "about", icon: Info, labelKey: "about" },
];

export interface SidebarProps {
  current: View;
  onSelect: (view: View) => void;
}

export function Sidebar({ current, onSelect }: SidebarProps) {
  const { t } = useTranslation();
  const { resolved, setMode } = useTheme();
  const nextMode = resolved === "dark" ? "light" : "dark";

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-canvas">
      <div className="flex h-14 items-center gap-2.5 px-3">
        <BrandMark className="text-ink" />
        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">MoonDeck</span>
      </div>

      <nav aria-label={t("nav.label")} className="flex flex-col gap-0.5 px-2">
        {navEntries.map((entry) => {
          const Icon = entry.icon;
          const active = entry.view === current;
          return (
            <button
              key={entry.view}
              type="button"
              className="nav-item"
              aria-current={active ? "page" : undefined}
              onClick={() => onSelect(entry.view)}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.6} />
              <span className="truncate">{t(`nav.${entry.labelKey}`)}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center justify-between px-3 py-3">
        <span className="t-label">{t("common.phase")}</span>
        <Tooltip label={t("nav.toggleTheme")}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t("nav.toggleTheme")}
            onClick={() => setMode(nextMode)}
          >
            {resolved === "dark" ? (
              <Moon aria-hidden="true" className="size-4" strokeWidth={1.6} />
            ) : (
              <Sun aria-hidden="true" className="size-4" strokeWidth={1.6} />
            )}
          </Button>
        </Tooltip>
      </div>
    </aside>
  );
}

