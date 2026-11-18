import { Check, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { useToastStore } from "@/components/ui/toast-store";
import { describeDeckError } from "@/features/deck/errors";
import { useDeckStore } from "@/features/deck/store";
import { HudCard } from "@/features/overlay/HudCard";
import { commands } from "@/lib/bindings";
import { cn } from "@/lib/cn";
import type { General, KeyLook, Mode, ThemeLook } from "@/lib/types";

const MAX_NAME = 40;

const NO_KEYS: KeyLook = {
  text: null,
  keyBg: null,
  keyFg: null,
  keyPressed: null,
  keyShape: "default",
  keySize: "md",
};

/** O visual atual do overlay, no formato de um tema (sem a imagem de fundo). */
export function currentLook(overlay: General["overlay"]): ThemeLook {
  return {
    preset: overlay.preset,
    background: overlay.background,
    accent: overlay.accent,
    imageDim: overlay.imageDim,
    opacity: overlay.opacity,
    customCss: overlay.customCss,
    animation: overlay.animation ?? "fade",
    timerStyle: overlay.timerStyle ?? "bar",
    buttonStyle: overlay.buttonStyle ?? "row",
    keys: overlay.keys ?? NO_KEYS,
  };
}

function sameLook(a: ThemeLook, b: ThemeLook): boolean {
  return (
    a.preset === b.preset &&
    a.background === b.background &&
    a.accent === b.accent &&
    a.imageDim === b.imageDim &&
    a.opacity === b.opacity &&
    a.customCss === b.customCss &&
    a.animation === b.animation &&
    a.timerStyle === b.timerStyle &&
    a.buttonStyle === b.buttonStyle &&
    JSON.stringify(a.keys ?? NO_KEYS) === JSON.stringify(b.keys ?? NO_KEYS)
  );
}

export interface ThemeGalleryProps {
  overlay: General["overlay"];
  savedThemes: General["savedThemes"];
  previewMode: Mode;
  modes: readonly Mode[];
  writable: boolean;
  onApply: (look: ThemeLook) => Promise<void>;
}

/** Os temas do usuário, guardados na config. */
export function ThemeGallery({ overlay, savedThemes, previewMode, modes, writable, onApply }: ThemeGalleryProps) {
  const { t } = useTranslation();
  const push = useToastStore((s) => s.push);
  const load = useDeckStore((s) => s.load);
  const [name, setName] = useState("");

  const now = currentLook(overlay);
  const sample: Mode = { ...previewMode, actions: previewMode.actions.slice(0, 3) };

  const cards = savedThemes.map((theme) => ({ id: theme.id, name: theme.name, look: theme.look }));

  async function save(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await commands.themeSave(trimmed, now);
      await load();
      setName("");
      push(t("themes.saved", { name: trimmed }), "success");
    } catch (cause) {
      push(describeDeckError(t, cause as never), "danger");
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await commands.themeDelete(id);
      await load();
    } catch (cause) {
      push(describeDeckError(t, cause as never), "danger");
    }
  }

  return (
    <div className="mt-4">
      <form
          className="mt-4 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <input
            className="input w-56"
            value={name}
            maxLength={MAX_NAME}
            placeholder={t("themes.namePlaceholder")}
            aria-label={t("themes.namePlaceholder")}
            disabled={!writable}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
          <Button type="submit" variant="secondary" disabled={!writable || !name.trim()}>
            <Plus aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
            {t("themes.saveCurrent")}
          </Button>
          <p className="t-small basis-full text-ink-3">{t("themes.saveHint")}</p>
        </form>

      {cards.length === 0 ? (
        <p className="t-small mt-4 text-ink-3">{t("themes.empty")}</p>
      ) : (
        <ul className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
          {cards.map((card) => {
            const active = sameLook(card.look, now);
            return (
              <li key={card.id} className="theme-card" data-active={active || undefined}>
                <button
                  type="button"
                  className="theme-card__apply"
                  disabled={!writable}
                  onClick={() => void onApply(card.look)}
                  aria-label={t("themes.apply", { name: card.name })}
                >
                  <span className="theme-card__stage" aria-hidden="true">
                    <span className="theme-card__zoom">
                      <HudCard
                        modes={modes}
                        mode={sample}
                        modeKey="Home"
                        look={{ ...card.look, scale: 100 }}
                        imageUrl={null}
                        scopeId={`theme-${card.id}`}
                        className="theme-card__hud"
                      />
                    </span>
                  </span>
                </button>
                <div className="flex items-center justify-between gap-2 px-1 pt-2">
                  <span className={cn("t-small min-w-0 flex-1 truncate font-medium", active && "text-live-strong")}>
                    {card.name}
                  </span>
                  {active ? <Check aria-label={t("themes.inUse")} className="size-3.5 text-live-strong" strokeWidth={2.2} /> : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("themes.delete", { name: card.name })}
                    onClick={() => void remove(card.id)}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.8} />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
