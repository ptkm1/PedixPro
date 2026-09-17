import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "pedidos-web-theme";
const GLASS_STORAGE_KEY = "pedidos-web-glass";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "light";
}

function readGlassStored(): boolean {
  try {
    const v = localStorage.getItem(GLASS_STORAGE_KEY);
    if (v === "0" || v === "false") return false;
    if (v === "1" || v === "true") return true;
  } catch {
    /* ignore */
  }
  // Padrão: glass ligado (tema atual).
  return true;
}

function applyDom(resolved: ResolvedTheme, glassEnabled: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.classList.toggle("theme-glass", glassEnabled);
  root.style.colorScheme = resolved;
}

type ThemeContextValue = {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
  glassEnabled: boolean;
  setGlassEnabled: (on: boolean) => void;
  toggleGlass: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStored);
  const [glassEnabled, setGlassEnabledState] = useState(readGlassStored);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const p = readStored();
    return p === "system" ? getSystemTheme() : p;
  });

  const setPreference = useCallback(
    (p: ThemePreference) => {
      setPreferenceState(p);
      try {
        localStorage.setItem(STORAGE_KEY, p);
      } catch {
        /* ignore */
      }
      const next = p === "system" ? getSystemTheme() : p;
      setResolved(next);
      applyDom(next, glassEnabled);
    },
    [glassEnabled],
  );

  const setGlassEnabled = useCallback(
    (on: boolean) => {
      setGlassEnabledState(on);
      try {
        localStorage.setItem(GLASS_STORAGE_KEY, on ? "1" : "0");
      } catch {
        /* ignore */
      }
      applyDom(resolved, on);
    },
    [resolved],
  );

  const toggleGlass = useCallback(() => {
    setGlassEnabled(!glassEnabled);
  }, [glassEnabled, setGlassEnabled]);

  useEffect(() => {
    const next = preference === "system" ? getSystemTheme() : preference;
    setResolved(next);
    applyDom(next, glassEnabled);
  }, [preference, glassEnabled]);

  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = getSystemTheme();
      setResolved(next);
      applyDom(next, glassEnabled);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference, glassEnabled]);

  const toggle = useCallback(() => {
    setPreference(resolved === "dark" ? "light" : "dark");
  }, [resolved, setPreference]);

  const value = useMemo(
    () => ({
      preference,
      resolved,
      setPreference,
      toggle,
      glassEnabled,
      setGlassEnabled,
      toggleGlass,
    }),
    [
      preference,
      resolved,
      setPreference,
      toggle,
      glassEnabled,
      setGlassEnabled,
      toggleGlass,
    ],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

/** Aplica tema + glass antes do primeiro paint (chamar no main.tsx). */
export function initThemeFromStorage() {
  const p = readStored();
  const resolved = p === "system" ? getSystemTheme() : p;
  applyDom(resolved, readGlassStored());
}
