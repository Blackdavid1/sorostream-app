"use client";
/**
 * PreferencesContext — user stream preferences stored in localStorage.
 *
 * Manages:
 *   defaultToken: string       — default token for new streams (e.g. "USDC")
 *   defaultDuration: number    — default stream duration in seconds (0 = not set)
 *   defaultCliffDuration: number — default cliff duration in seconds (0 = not set)
 *   preferredTheme: string     — "light" | "dark" | "high-contrast" | "system"
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const PREFERENCES_STORAGE_KEY = "sorostream-preferences";

/** Every theme value the app currently supports. */
export const PREFERRED_THEMES = ["light", "dark", "high-contrast", "system"] as const;

export type PreferredTheme = (typeof PREFERRED_THEMES)[number];

export interface StreamPreferences {
  defaultToken: string;
  defaultDuration: number;
  defaultCliffDuration: number;
  preferredTheme: PreferredTheme;
}

/** True when `value` is one of the currently supported theme names. */
export function isPreferredTheme(value: unknown): value is PreferredTheme {
  return typeof value === "string" && (PREFERRED_THEMES as readonly string[]).includes(value);
}

interface PreferencesContextValue extends StreamPreferences {
  setDefaultToken: (value: string) => void;
  setDefaultDuration: (value: number) => void;
  setDefaultCliffDuration: (value: number) => void;
  setPreferredTheme: (value: StreamPreferences["preferredTheme"]) => void;
  saveAll: (prefs: Partial<StreamPreferences>) => void;
  clearPreferences: () => void;
}

export const DEFAULT_PREFERENCES: StreamPreferences = {
  defaultToken: "",
  defaultDuration: 0,
  defaultCliffDuration: 0,
  preferredTheme: "system",
};

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

function loadPreferences(): StreamPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<StreamPreferences>;
    return {
      defaultToken: parsed.defaultToken ?? DEFAULT_PREFERENCES.defaultToken,
      defaultDuration: parsed.defaultDuration ?? DEFAULT_PREFERENCES.defaultDuration,
      defaultCliffDuration: parsed.defaultCliffDuration ?? DEFAULT_PREFERENCES.defaultCliffDuration,
      // A theme saved by an older app version may no longer exist; fall back
      // to the default instead of applying an unknown theme name.
      preferredTheme: isPreferredTheme(parsed.preferredTheme)
        ? parsed.preferredTheme
        : DEFAULT_PREFERENCES.preferredTheme,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function persist(next: StreamPreferences) {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<StreamPreferences>(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPrefs(loadPreferences());
  }, []);

  const setDefaultToken = useCallback((value: string) => {
    setPrefs((prev) => {
      const next = { ...prev, defaultToken: value };
      persist(next);
      return next;
    });
  }, []);

  const setDefaultDuration = useCallback((value: number) => {
    setPrefs((prev) => {
      const next = { ...prev, defaultDuration: value };
      persist(next);
      return next;
    });
  }, []);

  const setDefaultCliffDuration = useCallback((value: number) => {
    setPrefs((prev) => {
      const next = { ...prev, defaultCliffDuration: value };
      persist(next);
      return next;
    });
  }, []);

  const setPreferredTheme = useCallback((value: StreamPreferences["preferredTheme"]) => {
    setPrefs((prev) => {
      const next = { ...prev, preferredTheme: value };
      persist(next);
      return next;
    });
  }, []);

  const saveAll = useCallback((partial: Partial<StreamPreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...partial };
      persist(next);
      return next;
    });
  }, []);

  const clearPreferences = useCallback(() => {
    setPrefs(DEFAULT_PREFERENCES);
    try {
      localStorage.removeItem(PREFERENCES_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      ...prefs,
      setDefaultToken,
      setDefaultDuration,
      setDefaultCliffDuration,
      setPreferredTheme,
      saveAll,
      clearPreferences,
    }),
    [prefs, setDefaultToken, setDefaultDuration, setDefaultCliffDuration, setPreferredTheme, saveAll, clearPreferences],
  );

  return (
    <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
  );
}

/**
 * Access persisted UI preferences.
 *
 * @returns {PreferencesContextValue} Stream preferences plus per-field setters, `saveAll` and `clearPreferences`.
 * @throws {Error} When called outside a `PreferencesProvider`.
 */
export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
