/**
 * streamNotificationWatcher.ts
 *
 * Watches active streams and fires notifications when a stream approaches
 * expiry or when a claimable balance crosses a user-configured threshold.
 *
 * ---------------------------------------------------------------------------
 * NOTIFICATION TRIGGER SURFACE
 * ---------------------------------------------------------------------------
 * Every trigger this watcher can fire, and whether it is user-configurable
 * today:
 *
 *   1. Expiry threshold — 24h before stream end
 *        Hardcoded. Not user-configurable today.
 *        Constant: EXPIRY_THRESHOLD_24H_MS
 *
 *   2. Expiry threshold — 1h before stream end
 *        Hardcoded. Not user-configurable today.
 *        Constant: EXPIRY_THRESHOLD_1H_MS
 *
 *   3. Claimable-balance threshold
 *        User-configurable. Sourced from notificationPrefs.ts via
 *        getNotificationPrefs() -> prefs.claimableBalanceThreshold.
 *        When the stream's claimable balance is >= this value, a
 *        notification is fired.
 *
 * ---------------------------------------------------------------------------
 * RELATIONSHIP BETWEEN streamNotificationWatcher.ts AND notificationPrefs.ts
 * ---------------------------------------------------------------------------
 * - streamNotificationWatcher.ts owns the *trigger evaluation*: it decides
 *   when a notification should fire based on stream state and the thresholds
 *   above.
 * - notificationPrefs.ts owns the *user preferences*: it is the single source
 *   of truth for which thresholds the user has configured (currently only the
 *   claimable-balance threshold) and their values.
 * - The watcher reads preferences through getNotificationPrefs() and never
 *   mutates them. notificationPrefs.ts has no knowledge of the watcher.
 *
 * Adding a new trigger (for future contributors):
 *   1. If the trigger should be user-configurable, add the field to the
 *      preferences type and defaults in notificationPrefs.ts first.
 *   2. Read the new preference in streamNotificationWatcher.ts via
 *      getNotificationPrefs() and evaluate it alongside the existing
 *      thresholds in the watcher loop.
 *   3. If the trigger is hardcoded, add a named constant here (following the
 *      EXPIRY_THRESHOLD_* pattern) and document it in the trigger surface
 *      list above.
 *   4. Update the trigger surface list above so this documentation stays
 *      accurate.
 *
 * ---------------------------------------------------------------------------
 * CROSS-REFERENCE
 * ---------------------------------------------------------------------------
 * The configurable-thresholds enhancement (making the 24h/1h expiry
 * thresholds user-configurable, mirroring the claimable-balance threshold)
 * is tracked separately. Once that work lands, the expiry thresholds above
 * will move from "Hardcoded" to "User-configurable" and must be read from
 * notificationPrefs.ts. Keep this list in sync with that change.
 */

import { getNotificationPrefs } from './notificationPrefs';

/** 24 hours in milliseconds — hardcoded expiry threshold. */
export const EXPIRY_THRESHOLD_24H_MS = 24 * 60 * 60 * 1000;

/** 1 hour in milliseconds — hardcoded expiry threshold. */
export const EXPIRY_THRESHOLD_1H_MS = 60 * 60 * 1000;

export interface WatchedStream {
  id: string;
  endTime: number;
  claimableBalance: number;
}

export interface StreamNotification {
  streamId: string;
  kind: 'expiry-24h' | 'expiry-1h' | 'claimable-balance';
  message: string;
}

/**
 * Evaluate a single stream against the notification trigger surface and
 * return any notifications that should fire.
 */
export function evaluateStreamNotifications(
  stream: WatchedStream,
  now: number = Date.now(),
): StreamNotification[] {
  const notifications: StreamNotification[] = [];
  const timeToExpiry = stream.endTime - now;

  if (timeToExpiry <= EXPIRY_THRESHOLD_24H_MS && timeToExpiry > EXPIRY_THRESHOLD_1H_MS) {
    notifications.push({
      streamId: stream.id,
      kind: 'expiry-24h',
      message: `Stream ${stream.id} expires in less than 24 hours.`,
    });
  }

  if (timeToExpiry <= EXPIRY_THRESHOLD_1H_MS && timeToExpiry > 0) {
    notifications.push({
      streamId: stream.id,
      kind: 'expiry-1h',
      message: `Stream ${stream.id} expires in less than 1 hour.`,
    });
  }

  const prefs = getNotificationPrefs();
  if (stream.claimableBalance >= prefs.claimableBalanceThreshold) {
    notifications.push({
      streamId: stream.id,
      kind: 'claimable-balance',
      message: `Stream ${stream.id} has a claimable balance of ${stream.claimableBalance}.`,
    });
  }

  return notifications;
}
