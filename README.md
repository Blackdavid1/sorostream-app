# Project

## Two-Factor Authentication (TOTP)

This project supports time-based one-time password (TOTP) two-factor
authentication, implemented in `totp.ts` and surfaced in the UI through
`TwoFactorSetup.tsx`. The generator follows RFC 6238 (TOTP) on top of
RFC 4226 (HOTP), so it is intended to work with any standard authenticator
app that supports the `otpauth://totp` URI scheme.

### Enrollment and verification flow

1. **Secret generation** — When a user enables 2FA, `totp.ts` generates a
   random, base32-encoded shared secret. This secret is the only value the
   authenticator app and the server must agree on.
2. **Provisioning URI / QR code** — The secret is combined with the account
   label and issuer into an `otpauth://totp/...` URI. `TwoFactorSetup.tsx`
   renders this URI as a QR code for the user to scan, and also displays the
   secret in text form so it can be entered manually if scanning is not
   possible.
3. **Code entry** — The user scans the QR code (or types the secret) into
   their authenticator app, which then displays a rotating 6-digit code.
   The user enters that code into the setup form to confirm enrollment.
4. **Verification** — The submitted code is validated against the shared
   secret using the current time step. On success, 2FA is enabled for the
   account and the secret is stored for future logins. On subsequent
   logins, the user is prompted for a fresh code, which is verified the same
   way.

### Compatible authenticator apps

The implementation targets the standard TOTP parameters (SHA-1, 6 digits,
30-second period) used by the `otpauth://totp` scheme. It is expected to be
compatible with, and should be verified against, the following apps:

- Google Authenticator (Android / iOS)
- Authy (Android / iOS / desktop)
- Microsoft Authenticator (Android / iOS)
- 1Password (all platforms)
- Bitwarden (all platforms)
- FreeOTP (Android / iOS)

When adding or changing TOTP parameters, re-verify enrollment and login
against at least Google Authenticator and one other app from this list.

### Troubleshooting code mismatches (support)

If a user reports that codes from their authenticator app are rejected:

- **Clock drift** — TOTP depends on the device clock. Ask the user to enable
  automatic date/time ("set time automatically") on the device running the
  authenticator app, then try again. A device that is more than ~30 seconds
  off will produce codes the server rejects.
- **Wrong account/secret** — Confirm the user scanned the correct QR code or
  entered the full secret. If the secret was mistyped, have them remove the
  entry and re-enroll.
- **Stale code** — Codes rotate every 30 seconds. Ask the user to wait for
  the next code before submitting, and to enter it promptly.
- **Re-enrollment** — If the above do not resolve it, disable and re-enable
  2FA for the account so a fresh secret and QR code are generated.
