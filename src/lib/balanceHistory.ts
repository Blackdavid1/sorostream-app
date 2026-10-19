/**
 * IndexedDB utility for storing and retrieving balance history snapshots
 *
 * ## Purpose
 * This module is the **long-term, time-series history store**. It persists
 * balance snapshots over time so the UI can render historical charts, compute
 * period-over-period changes (`calculatePeriodChange`) and filter by ranges
 * such as 1D/7D/30D/90D/ALL (`filterByTimeRange`). Snapshots are keyed by
 * timestamp and retained for a configurable window (see `cleanupOldSnapshots`,
 * default 90 days).
 *
 * ## When to use this vs. `balanceCache.ts`
 * - Use **this module** when you need a durable, append-only series of past
 *   balances for analytics, charts, or trend calculations.
 * - Use **`balanceCache.ts`** when you need a short-lived, latest-value cache
 *   for fast reads of the *current* balance (e.g. avoiding redundant network
 *   calls). It is not intended to be queried as a time series.
 *
 * ## Relationship to `balanceCache.ts`
 * The two stores intentionally serve distinct use cases (history vs. cache),
 * but their `BalanceSnapshot` shapes and IndexedDB plumbing overlap. That
 * overlap is **legacy duplication slated for consolidation** — see the related
 * consolidation/duplication enhancement tracking issue. Until that lands, keep
 * the two modules consistent: if you change the snapshot shape or storage
 * semantics here, check whether `balanceCache.ts` needs the same change.
 */

const DB_NAME = "SoroStreamBalanceHistory";
const DB_VERSION = 1;
const STORE_NAME = "balanceSnapshots";

export interface BalanceSnapshot {
  id: string;
  timestamp: number;
  totalBalance: number;
  tokenBalances: Record<string, number>;
  streamCount: number;
}

export interface PeriodChange {
  percentage: number;
  absolute: number;
  startBalance: number;
  endBalance: number;
}

/**
 * Initialize IndexedDB and create object store
 */
async function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

/**
 * Store a balance snapshot
 */
export async function storeBalanceSnapshot(snapshot: Omit<BalanceSnapshot, "id">): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    const snapshotWithId: BalanceSnapshot = {
      ...snapshot,
      id: `snapshot-${snapshot.timestamp}`,
    };

    const request = store.put(snapshotWithId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

/**
 * Get balance snapshots within a time range
 */
export async function getBalanceHistory(
  startTime: number,
  endTime: number
): Promise<BalanceSnapshot[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    const range = IDBKeyRange.bound(startTime, endTime);
    const request = index.getAll(range);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Get all balance snapshots
 */
export async function getAllBalanceHistory(): Promise<BalanceSnapshot[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

/**
 * Delete old snapshots (keep last N days)
 */
export async function cleanupOldSnapshots(daysToKeep: number = 90): Promise<void> {
  const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    const range = IDBKeyRange.upperBound(cutoffTime);
    const request = index.openCursor(range);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}

/**
 * Calculate period change (percentage and absolute)
 */
export function calculatePeriodChange(
  snapshots: BalanceSnapshot[]
): PeriodChange | null {
  if (snapshots.length < 2) return null;

  const sorted = [...snapshots].sort((a, b) => a.timestamp - b.timestamp);
  const startBalance = sorted[0].totalBalance;
  const endBalance = sorted[sorted.length - 1].totalBalance;

  const absolute = endBalance - startBalance;
  const percentage = startBalance > 0 ? (absolute / startBalance) * 100 : 0;

  return {
    percentage,
    absolute,
    startBalance,
    endBalance,
  };
}

/**
 * Filter snapshots by time range
 */
export function filterByTimeRange(
  snapshots: BalanceSnapshot[],
  range: "1D" | "7D" | "30D" | "90D" | "ALL"
): BalanceSnapshot[] {
  if (range === "ALL") return snapshots;

  const now = Date.now();
  const ranges: Record<string, number> = {
    "1D": 24 * 60 * 60 * 1000,
    "7D": 7 * 24 * 60 * 60 * 1000,
    "30D": 30 * 24 * 60 * 60 * 1000,
    "90D": 90 * 24 * 60 * 60 * 1000,
  };

  const startTime = now - ranges[range];
  return snapshots.filter((s) => s.timestamp >= startTime);
}
