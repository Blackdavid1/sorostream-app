"use client";
/**
 * NotificationContext (#193)
 *
 * Maintains a client-side unread count per navigation section. It subscribes to
 * the SDK's stream events (transaction updates) and increments the relevant
 * section's badge. Counts are persisted to localStorage so they survive reloads
 * and stay in sync across multiple browser tabs.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getStreamEvents, type StreamEvent } from "@/src/lib/sorostream";
import { checkStreamNotifications } from "@/src/lib/streamNotificationWatcher";

/** Display cap — counts above this render as "99+". */
export const BADGE_CAP = 99;

const STORAGE_KEY = "sorostream-notifications";
/** How often we poll for new stream events (ms). Keeps badges < 1s behind. */
const POLL_INTERVAL = 1000;

type Counts = Record<string, number>;

interface PersistedState {
  counts: Counts;
  lastSeenId: string | null;
}

interface NotificationContextValue {
  counts: Counts;
  /** Unread count for a section, or 0. */
  countFor: (section: string) => number;
  /** Reset a section's unread count to zero (call when the user visits it). */
  clearSection: (section: string) => void;
  /**
   * Zero every section's unread count in this tab and in every other open tab
   * (e.g. for a "clear all notifications" button).
   */
  markAllAsReadEverywhere: () => void;
  /** Manually trigger an evaluation of stream notifications (#76). */
  checkNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

/** Map a stream event to the nav section whose badge it should increment. */
function sectionForEvent(_event: StreamEvent): string {
  // All transaction/stream activity surfaces under the Dashboard today.
  return "/dashboard";
}

function load(): PersistedState {
  if (typeof window === "undefined") return { counts: {}, lastSeenId: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { counts: {}, lastSeenId: null };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return { counts: parsed.counts ?? {}, lastSeenId: parsed.lastSeenId ?? null };
  } catch {
    return { counts: {}, lastSeenId: null };
  }
}

function persist(state: PersistedState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>({});
  const lastSeenIdRef = useRef<string | null>(null);
  // Mirror of counts for the polling closure (avoids re-creating the interval).
  const countsRef = useRef<Counts>({});

  // Restore persisted state on mount.
  useEffect(() => {
    const initial = load();
    setCounts(initial.counts);
    lastSeenIdRef.current = initial.lastSeenId;
  }, []);

  useEffect(() => {
    countsRef.current = counts;
  }, [counts]);

  const commit = useCallback((nextCounts: Counts, lastSeenId: string | null) => {
    setCounts(nextCounts);
    lastSeenIdRef.current = lastSeenId;
    persist({ counts: nextCounts, lastSeenId });
  }, []);

  // Poll for new events and increment the relevant section's badge.
  useEffect(() => {
    const tick = () => {
      const events = getStreamEvents(); // newest first
      if (events.length === 0) return;
      const lastSeen = lastSeenIdRef.current;
      // Collect events newer than the last one we counted.
      const fresh: StreamEvent[] = [];
      for (const ev of events) {
        if (ev.id === lastSeen) break;
        fresh.push(ev);
      }
      if (lastSeen === null) {
        // First run: don't retroactively flag the seed events as unread.
        lastSeenIdRef.current = events[0].id;
        persist({ counts: countsRef.current, lastSeenId: events[0].id });
        return;
      }
      if (fresh.length === 0) return;
      const next = { ...countsRef.current };
      for (const ev of fresh) {
        const section = sectionForEvent(ev);
        next[section] = (next[section] ?? 0) + 1;
      }
      commit(next, events[0].id);
    };

    const interval = setInterval(tick, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [commit]);

  // Cross-tab sync: adopt counts written by other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as PersistedState;
        setCounts(parsed.counts ?? {});
        lastSeenIdRef.current = parsed.lastSeenId ?? lastSeenIdRef.current;
      } catch {
        // ignore malformed payloads
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Monitor stream events for expiry and claimable thresholds (#76)
  useEffect(() => {
    void checkStreamNotifications();

    const interval = setInterval(() => {
      void checkStreamNotifications();
    }, 5000);

    const onVisibility = () => {
      void checkStreamNotifications();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const checkNotifications = useCallback(async () => {
    await checkStreamNotifications();
  }, []);

  const clearSection = useCallback(
    (section: string) => {
      setCounts((prev) => {
        if (!prev[section]) return prev;
        const next = { ...prev, [section]: 0 };
        persist({ counts: next, lastSeenId: lastSeenIdRef.current });
        return next;
      });
    },
    [],
  );

  const markAllAsReadEverywhere = useCallback(() => {
    setCounts((prev) => {
      // Include sections only known from storage (e.g. written by another
      // tab before this one synced) so nothing is left behind.
      const sections = new Set([...Object.keys(prev), ...Object.keys(load().counts)]);
      const next: Counts = {};
      for (const section of sections) next[section] = 0;
      // Writing to localStorage fires a "storage" event in every other tab,
      // which the cross-tab sync effect above adopts.
      persist({ counts: next, lastSeenId: lastSeenIdRef.current });
      return next;
    });
  }, []);

  const countFor = useCallback((section: string) => counts[section] ?? 0, [counts]);

  const value = useMemo(
    () => ({ counts, countFor, clearSection, markAllAsReadEverywhere, checkNotifications }),
    [counts, countFor, clearSection, markAllAsReadEverywhere, checkNotifications],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

/**
 * Access the in-app notification centre.
 *
 * @returns {NotificationContextValue} Per-section unread counts and helpers to read or clear them.
 * @throws {Error} When called outside a `NotificationProvider`.
 */
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
