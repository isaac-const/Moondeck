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
import { useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { AppIcon } from "@/components/ui/AppIcon";
import { EngineStatusPill } from "@/components/ui/EngineStatusPill";
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

  // Destaque deslizante: uma peça só que anda entre os itens, em vez de cada
  // item acender e apagar. A primeira posição entra sem animar.
  const navRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    function measure(): void {
      const item = itemRefs.current[current];
      if (!item) return;
      setBox({ top: item.offsetTop, height: item.offsetHeight });
    }
    measure();
    const frame = requestAnimationFrame(() => setAnimate(true));
    const nav = navRef.current;
    const observer = nav ? new ResizeObserver(measure) : null;
    if (nav) observer?.observe(nav);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [current]);

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-bg-elevated">
      <div className="flex h-16 items-center gap-3 px-4">
        <AppIcon size={30} className="shrink-0" />
        <span className="text-[17px] font-semibold leading-none tracking-[-0.035em] text-text-primary">
          Moon<span className="font-medium text-accent-silver/75">Deck</span>
        </span>
      </div>

      <nav
        ref={navRef}
        aria-label={t("nav.label")}
        className="relative mx-2 flex flex-col gap-0.5"
      >
        {box ? (
          <span
            aria-hidden="true"
            className="nav-highlight"
            data-animate={animate}
            style={{ transform: `translateY(${box.top}px)`, height: box.height }}
          />
        ) : null}
        {navEntries.map((entry) => {
          const Icon = entry.icon;
          const active = entry.view === current;
          return (
            <button
              key={entry.view}
              type="button"
              ref={(node) => {
                itemRefs.current[entry.view] = node;
              }}
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

      <div className="mt-auto flex items-center justify-between gap-2 px-4 py-3">
        <EngineStatusPill />
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

