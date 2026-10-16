# Notification Thresholds

This document describes every notification trigger currently emitted by the
stream notification system, whether each trigger is user-configurable today,
and how the two files that own this surface relate to one another.

## Files involved

- **`streamNotificationWatcher.ts`** — the watcher that periodically scans
  streams and decides *when* to fire a notification. It owns the trigger
  conditions (expiry windows and the claimable-balance check) and the
  scheduling logic that evaluates them.
- **`notificationPrefs.ts`** — the source of user preferences. It owns the
  *values* the watcher reads when a trigger is user-configurable (for example,
  the claimable-balance threshold) and the enable/disable flags for the
  notification categories.

The watcher never hardcodes a user-facing value that belongs in preferences;
it reads the preference and falls back to a default only when the user has not
set one. Preferences never decide *when* to fire — they only supply the
thresholds and toggles the watcher consumes.

## Notification triggers

| Trigger | Where it lives | User-configurable today? |
| --- | --- | --- |
| **24h expiry** — stream is within 24 hours of expiring | `streamNotificationWatcher.ts` (hardcoded window) | No — fixed at 24h |
| **1h expiry** — stream is within 1 hour of expiring | `streamNotificationWatcher.ts` (hardcoded window) | No — fixed at 1h |
| **Claimable balance** — stream's claimable balance crosses the configured threshold | `streamNotificationWatcher.ts` evaluates; threshold sourced from `notificationPrefs.ts` | Yes — threshold value is user-configurable |

### Summary

- **Hardcoded today:** the 24h and 1h expiry thresholds.
- **User-configurable today:** the claimable-balance threshold, read from
  `notificationPrefs.ts`.

## Adding a new trigger

When adding a new notification trigger, follow the existing split of
responsibilities:

1. **Decide the trigger condition** in `streamNotificationWatcher.ts`. Add the
   evaluation alongside the existing expiry and balance checks so it runs on
   the same scan cadence.
2. **Decide whether it is configurable.** If the threshold or toggle should be
   user-adjustable, add the corresponding preference (with a sensible default)
   to `notificationPrefs.ts` and read it from the watcher. If it is a fixed
   window like the expiry thresholds, keep it hardcoded in the watcher and note
   it in the table above.
3. **Update this document.** Add the new trigger to the table, mark it as
   user-configurable or hardcoded, and describe which file owns each part.

## Related work

The set of configurable thresholds is expected to grow. The
**configurable-thresholds enhancement** will make the expiry windows (currently
hardcoded at 24h and 1h) user-adjustable through `notificationPrefs.ts`, in the
same way the claimable-balance threshold already is.

Once that enhancement lands, update the table above so the expiry rows reflect
their new configurable status and the values are documented as sourced from
`notificationPrefs.ts`. Until then, treat the 24h and 1h windows as hardcoded.
