import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  applyMotion,
  applyTheme,
  persistMotion,
  persistTheme,
  readStoredMotion,
  readInitialTheme,
  resolveTheme,
  systemPrefersDark,
  type MotionPreference,
  type ResolvedTheme,
  type ThemeMode,
} from "./theme";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  motion: MotionPreference;
  setMode: (mode: ThemeMode) => void;
  setMotion: (preference: MotionPreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(readInitialTheme);
  const [motion, setMotionState] = useState<MotionPreference>(readStoredMotion);
  const [prefersDark, setPrefersDark] = useState(systemPrefersDark);

  // O tema do sistema pode mudar com o app aberto (agendamento noturno, KDE).
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent): void => setPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolved = resolveTheme(mode, prefersDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    applyMotion(motion);
  }, [motion]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    persistTheme(next);
  }, []);

  const setMotion = useCallback((next: MotionPreference) => {
    setMotionState(next);
    persistMotion(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, motion, setMode, setMotion }),
    [mode, resolved, motion, setMode, setMotion],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme precisa estar dentro de <ThemeProvider>");
  return context;
}
