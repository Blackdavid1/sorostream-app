# TOTP 2FA Setup Flow and Authenticator Compatibility

This document describes the Time-based One-Time Password (TOTP) two-factor
authentication (2FA) enrollment and verification flow, the authenticator apps
the implementation is expected to work with, and troubleshooting guidance for
support when a user reports that generated codes do not match.

The implementation lives in `totp.ts` (RFC 6238-compatible secret generation)
and is surfaced to users through `TwoFactorSetup.tsx`.

## Overview

The TOTP implementation follows [RFC 6238](https://datatracker.ietf.org/doc/html/rfc6238)
and is intended to be compatible with standard authenticator apps. It uses the
conventional defaults that authenticator apps expect:

- **Algorithm:** HMAC-SHA1
- **Digits:** 6
- **Period:** 30 seconds
- **Secret encoding:** Base32 (no padding), as used in `otpauth://` URIs

Because these are the defaults assumed by virtually every authenticator app,
the generated secret can be enrolled by scanning a QR code or by manually
entering the Base32 secret.

## End-to-End Enrollment and Verification Flow

1. **Secret generation**
   When a user starts 2FA setup, the server generates a new random TOTP secret
   using the RFC 6238-compatible generator in `totp.ts`. The secret is stored
   server-side and associated with the user's account. It is not yet active
   until the user verifies a code.

2. **Provisioning URI / QR code**
   The secret is encoded into a standard `otpauth://totp/...` provisioning URI
   that includes the issuer, the account label (e.g. the user's email or
   username), and the algorithm/digits/period parameters. `TwoFactorSetup.tsx`
   renders this URI as a QR code for the user to scan, and also displays the
   Base32 secret for manual entry.

3. **User enrollment in an authenticator app**
   The user scans the QR code (or types the Base32 secret) into their
   authenticator app. The app stores the secret and begins generating 6-digit
   codes that rotate every 30 seconds.

4. **Code entry and verification**
   The user enters the current code from their authenticator app into the setup
   screen. The server recomputes the expected TOTP for the current time window
   and compares it to the submitted code. To tolerate minor clock differences
   and the moment of code rotation, verification typically accepts the current
   window plus a small number of adjacent windows (clock-drift tolerance).

5. **Activation**
   On a successful match, 2FA is marked active for the account. Subsequent
   logins require a valid TOTP code in addition to the user's password.

6. **Ongoing verification**
   At each login (or other protected action), the user submits a fresh code and
   the server validates it against the stored secret using the same window and
   drift-tolerance logic.

## Authenticator App Compatibility

The implementation targets the standard TOTP profile (SHA1 / 6 digits / 30s),
which the following apps support. Apps marked **verified** have been confirmed
against this implementation; apps marked **should verify** are expected to work
but have not been formally confirmed and should be tested before being listed
as supported.

| App | Platform | Status |
| --- | --- | --- |
| Google Authenticator | iOS, Android | Verified |
| Authy | iOS, Android, Desktop | Verified |
| 1Password | iOS, Android, Desktop, Browser | Verified |
| Microsoft Authenticator | iOS, Android | Should verify |
| Bitwarden Authenticator | iOS, Android, Browser | Should verify |
| FreeOTP | iOS, Android | Should verify |
| Aegis Authenticator | Android | Should verify |
| Raivo OTP | iOS | Should verify |

When adding a new app to the verified list, confirm that:

- Scanning the QR code enrolls the correct issuer and account label.
- Manually entering the Base32 secret produces the same codes as scanning.
- Generated codes are accepted by the server during setup and at login.

## Troubleshooting Code-Mismatch Issues (Support Guide)

If a user reports that the codes from their authenticator app are rejected:

1. **Check the device clock (most common cause).**
   TOTP is time-based, so a device clock that is off by more than the allowed
   drift tolerance will produce codes the server rejects. Ask the user to
   enable automatic date/time on their device ("Set automatically" on iOS,
   "Automatic date and time" on Android) and confirm the time zone is correct.
   After the clock is corrected, the user should wait for the next code to
   rotate before trying again.

2. **Confirm the correct account entry.**
   Users with multiple accounts in the same app sometimes read the code for the
   wrong entry. Ask them to confirm the issuer/account label shown in the app
   matches the account they are signing in to.

3. **Re-check the secret / re-enroll.**
   If the secret was entered manually, a transcription error (e.g. confusing
   `0`/`O` or `1`/`I`) will produce codes that never match. Have the user
   re-scan the QR code or re-enter the Base32 secret carefully. If the secret
   was regenerated server-side, the old entry in the app must be removed and
   the new one added.

4. **Verify the app's TOTP settings.**
   Some apps allow overriding the algorithm, digit count, or period. Confirm
   the entry uses SHA1, 6 digits, and a 30-second period to match this
   implementation.

5. **Wait for the next window.**
   Codes rotate every 30 seconds. If the user submits a code right as it
   expires, ask them to wait for the next code and try again promptly.

6. **Escalate if unresolved.**
   If the clock is correct, the entry is correct, and codes still fail, the
   issue may be a server-side secret mismatch. Escalate to engineering to
   confirm the stored secret matches the one provisioned to the user.
