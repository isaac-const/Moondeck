import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@/features/overlay/ActionIcon";
import { commands } from "@/lib/bindings";
import { isTauri } from "@/lib/runtime";

type App = { name: string; command: string; args: string[] };

export interface AppPickerProps {
  onPick: (app: App) => void;
}

/** Busca entre os programas instalados: escolher é melhor que adivinhar o executável. */
export function AppPicker({ onPick }: AppPickerProps) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<App[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    void commands.appsList().then((list) => {
      if (!cancelled) setApps(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!apps || !needle) return [];
    const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const flat = squash(needle);
    return apps
      .filter((app) => app.name.toLowerCase().includes(needle) || squash(app.name).includes(flat) || squash(app.command).includes(flat))
      .slice(0, 6);
  }, [apps, query]);

  if (!isTauri()) return null;

  return (
    <div>
      <label htmlFor="action-app-search" className="t-label block">
        {t("actions.appSearch")}
      </label>
      <div className="relative mt-1.5">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
          strokeWidth={1.8}
        />
        <input
          id="action-app-search"
          className="input w-full pl-9"
          value={query}
          placeholder={apps === null ? t("actions.appLoading") : t("actions.appSearchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
        />
      </div>
      {query.trim() && apps ? (
        matches.length > 0 ? (
          <ul className="app-results mt-2" role="listbox" aria-label={t("actions.appSearch")}>
            {matches.map((app) => (
              <li key={`${app.name}-${app.command}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="app-result"
                  onClick={() => {
                    onPick(app);
                    setQuery("");
                  }}
                >
                  <span className="app-result__icon">
                    <ActionIcon icon={null} payload={{ kind: "app", command: app.command, args: [] }} size={24} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{app.name}</span>
                  <span className="t-mono max-w-[40%] truncate text-ink-3">{app.command.split("/").pop()}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small mt-2 text-ink-3">{t("actions.appNone")}</p>
        )
      ) : null}
    </div>
  );
}
