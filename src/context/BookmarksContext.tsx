"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useWallet } from "@/src/context/WalletContext";

export const MAX_BOOKMARKS = 20;

interface BookmarksContextValue {
  bookmarkedIds: Set<string>;
  isBookmarked: (id: string) => boolean;
  toggleBookmark: (id: string) => void;
  /** Maximum number of bookmarks kept per wallet. */
  maxBookmarks: number;
  /** True when the cap is reached and new bookmarks will be dropped. */
  isAtCapacity: boolean;
  /**
   * The bookmark that would be dropped if `toggleBookmark(id)` were called
   * now, or null if nothing would be dropped. When the cap is reached the
   * incoming bookmark is the one dropped (existing bookmarks are kept), so
   * this returns `id` itself in that case. Use it to warn the user first.
   */
  getEvictionCandidate: (id: string) => string | null;
  /**
   * The bookmark dropped by the most recent `toggleBookmark` call because the
   * cap was reached, or null if that call did not drop anything.
   */
  lastEvictedId: string | null;
}

const BookmarksContext = createContext<BookmarksContextValue | undefined>(undefined);

function storageKey(address: string | null): string | null {
  return address ? `sorostream-bookmarks-${address}` : null;
}

function loadBookmarks(address: string | null): Set<string> {
  const key = storageKey(address);
  if (!key || typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(parsed) ? (parsed as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveBookmarks(address: string | null, ids: Set<string>): void {
  const key = storageKey(address);
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage errors (private browsing, quota)
  }
}

export function BookmarksProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [lastEvictedId, setLastEvictedId] = useState<string | null>(null);

  useEffect(() => {
    setBookmarkedIds(loadBookmarks(address));
    setLastEvictedId(null);
  }, [address]);

  const toggleBookmark = useCallback(
    (id: string) => {
      setBookmarkedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          if (next.size >= MAX_BOOKMARKS) {
            // Cap reached: the new bookmark is dropped, existing ones stay.
            setLastEvictedId(id);
            return prev;
          }
          next.add(id);
        }
        setLastEvictedId(null);
        saveBookmarks(address, next);
        return next;
      });
    },
    [address],
  );

  const isBookmarked = useCallback(
    (id: string) => bookmarkedIds.has(id),
    [bookmarkedIds],
  );

  const isAtCapacity = bookmarkedIds.size >= MAX_BOOKMARKS;

  const getEvictionCandidate = useCallback(
    (id: string) => (!bookmarkedIds.has(id) && bookmarkedIds.size >= MAX_BOOKMARKS ? id : null),
    [bookmarkedIds],
  );

  const value = useMemo(
    () => ({
      bookmarkedIds,
      isBookmarked,
      toggleBookmark,
      maxBookmarks: MAX_BOOKMARKS,
      isAtCapacity,
      getEvictionCandidate,
      lastEvictedId,
    }),
    [bookmarkedIds, isBookmarked, toggleBookmark, isAtCapacity, getEvictionCandidate, lastEvictedId],
  );

  return (
    <BookmarksContext.Provider value={value}>
      {children}
    </BookmarksContext.Provider>
  );
}

/**
 * Access bookmarked streams.
 *
 * @returns {BookmarksContextValue} Bookmarked stream IDs, `isBookmarked`/`toggleBookmark` helpers and cap/eviction info.
 * @throws {Error} When called outside a `BookmarksProvider`.
 */
export function useBookmarks() {
  const ctx = useContext(BookmarksContext);
  if (!ctx) throw new Error("useBookmarks must be used within BookmarksProvider");
  return ctx;
}
