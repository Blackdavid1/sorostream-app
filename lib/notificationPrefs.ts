/**
 * Notification preferences and the notification threshold configuration surface.
 *
 * ## Notification triggers
 *
 * Notifications are produced by `streamNotificationWatcher.ts`, which fires on
 * the following triggers:
 *
 * | Trigger                     | Source of truth                          | User-configurable today? |
 * | --------------------------- | ---------------------------------------- | ------------------------ |
 * | Stream expires in 24h       | Hardcoded in `streamNotificationWatcher` | No                       |
 * | Stream expires in 1h        | Hardcoded in `streamNotificationWatcher` | No                       |
 * | Claimable balance threshold | `notificationPrefs` (this file)          | Yes                      |
 *
 * The 24h and 1h expiry thresholds are fixed constants in the watcher. The
 * claimable-balance threshold is the only trigger whose value is read from the
 * user's preferences via this module.
 *
 * ## Relationship between `streamNotificationWatcher.ts` and `notificationPrefs.ts`
 *
 * `notificationPrefs.ts` owns the persisted, user-editable preference values
 * (including the claimable-balance threshold). `streamNotificationWatcher.ts`
 * is the consumer: it reads the resolved preferences and decides which
 * notifications to emit. To add a new trigger, a contributor should:
 *
 * 1. Add the preference field (with a default) to the prefs type and defaults
 *    in this file, plus any validation/normalization.
 * 2. Read the resolved value in `streamNotificationWatcher.ts` and wire it into
 *    the trigger evaluation alongside the existing thresholds.
 * 3. Update the trigger table above so the documentation stays accurate.
 *
 * ## Cross-reference
 *
 * Making the expiry thresholds (24h/1h) user-configurable is tracked by the
 * configurable-thresholds enhancement. When that lands, the expiry rows above
 * should move from "No" to "Yes" and point at the corresponding preference
 * fields in this file.
 */

export interface NotificationPrefs {
  /**
   * Minimum claimable balance (in the stream's asset units) that must be
   * reached before a claimable-balance notification is emitted.
   *
   * This is the only notification threshold that is user-configurable today;
   * the 24h/1h expiry thresholds are hardcoded in `streamNotificationWatcher`.
   */
  claimableBalanceThreshold: number;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  claimableBalanceThreshold: 0,
};

export function resolveNotificationPrefs(
  prefs?: Partial<NotificationPrefs> | null,
): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(prefs ?? {}),
  };
}
