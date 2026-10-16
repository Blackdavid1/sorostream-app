# Contributing

Thanks for your interest in contributing! Please open an issue before starting
significant work so we can align on scope and approach.

## Development

- Install dependencies with your package manager of choice.
- Run the dev server and tests using the scripts defined in `package.json`.
- Keep changes focused; avoid unrelated refactors in the same pull request.

## Notification Thresholds

Notifications are produced by `streamNotificationWatcher.ts`, which reads user
preferences from `notificationPrefs.ts`. This section documents every current
notification trigger and whether it is user-configurable today.

### Triggers

| Trigger | Threshold | Configurable today? | Source |
| --- | --- | --- | --- |
| Stream expiry (24h) | 24 hours before expiry | No — hardcoded | `streamNotificationWatcher.ts` |
| Stream expiry (1h) | 1 hour before expiry | No — hardcoded | `streamNotificationWatcher.ts` |
| Claimable balance | User-defined balance threshold | Yes | `notificationPrefs.ts` |

### How the two files relate

- `streamNotificationWatcher.ts` owns the watcher loop and decides *when* to
  evaluate streams against the thresholds above. The 24h and 1h expiry
  thresholds are constants defined in this file.
- `notificationPrefs.ts` owns the persisted user preferences, including the
  claimable-balance threshold. The watcher reads these preferences to decide
  whether the balance trigger should fire.

### Adding a new trigger

1. Decide whether the trigger is hardcoded or user-configurable.
2. If it is user-configurable, add the preference (with a sensible default) to
   `notificationPrefs.ts` and expose it wherever preferences are edited.
3. Add the evaluation logic to `streamNotificationWatcher.ts`, reading the
   preference from `notificationPrefs.ts` when applicable.
4. Update the table above so this document stays accurate.

### Related work

The configurable-thresholds enhancement will make the expiry thresholds
user-configurable. Once that lands, update the table above to mark the 24h and
1h expiry triggers as configurable and point them at `notificationPrefs.ts`.
