/**
 * Tema e movimento.
 *
 * Persistência provisória em localStorage (Fase 0). Na Fase 2 isso migra para
 * o config.json versionado, com o Rust como fonte da verdade — a API pública
 * deste módulo não muda, só o backend de leitura/escrita.
 */

export const THEME_STORAGE_KEY = "moondeck.theme";
export const MOTION_STORAGE_KEY = "moondeck.motion";
export const LOCALE_STORAGE_KEY = "moondeck.locale";

export const themeModes = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof themeModes)[number];

export type ResolvedTheme = "light" | "dark";

export const motionPreferences = ["full", "reduced"] as const;
export type MotionPreference = (typeof motionPreferences)[number];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return isOneOf(themeModes, value);
}

export function isMotionPreference(value: unknown): value is MotionPreference {
  return isOneOf(motionPreferences, value);
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // localStorage pode estar indisponível (modo privado, política de origem).
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Sem persistência: o app segue funcionando na sessão.
  }
}

export function readStoredTheme(): ThemeMode {
  const stored = readStorage(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : "system";
}

/** Tema inicial: override de dev (`?theme=`) na frente do valor persistido. */
export function readInitialTheme(): ThemeMode {
  const override = import.meta.env.DEV ? themeOverrideFromSearch() : null;
  return override ?? readStoredTheme();
}

export function readStoredMotion(): MotionPreference {
  const stored = readStorage(MOTION_STORAGE_KEY);
  return isMotionPreference(stored) ? stored : "full";
}

export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function systemPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset["theme"] = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === "dark" ? "#090c10" : "#f2efe8";
}

/**
 * Aplica o movimento efetivo: a preferência do app OU a do sistema.
 * O CSS trata os dois caminhos (`[data-motion="reduced"]` e a media query).
 */
export function applyMotion(preference: MotionPreference): void {
  const root = document.documentElement;
  if (preference === "reduced") {
    root.dataset["motion"] = "reduced";
  } else {
    delete root.dataset["motion"];
  }
}

export function persistTheme(mode: ThemeMode): void {
  writeStorage(THEME_STORAGE_KEY, mode);
}

export function persistMotion(preference: MotionPreference): void {
  writeStorage(MOTION_STORAGE_KEY, preference);
}

export function persistLocale(locale: string): void {
  writeStorage(LOCALE_STORAGE_KEY, locale);
}

export function readStoredLocale(): string | null {
  return readStorage(LOCALE_STORAGE_KEY);
}

/**
 * Roda antes do React montar, para o primeiro paint já sair no tema certo.
 * Chamado em `main.tsx`.
 */
export function primeDocument(): void {
  const theme = readInitialTheme();
  applyTheme(resolveTheme(theme, systemPrefersDark()));
  applyMotion(readStoredMotion());
}

/** `?theme=light|dark` — só em dev, para conferir as duas variantes de uma vez. */
function themeOverrideFromSearch(): ResolvedTheme | null {
  const value = new URLSearchParams(window.location.search).get("theme");
  return value === "light" || value === "dark" ? value : null;
}
