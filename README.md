# sorostream-app

![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?logo=tailwindcss)
![License](https://img.shields.io/badge/license-MIT-green)

Next.js 14 streaming dashboard for **SoroStream** — real-time USDC payment streaming on Stellar Soroban.

## Live Demo

https://sorostream-app.vercel.app

## Screenshots

Visit the [live demo](https://sorostream-app.vercel.app) to see the app in action.

## Local Setup

```bash
# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local — .env.example lists every NEXT_PUBLIC_* variable with a
# one-line description; entries marked "# Required in production" must be set
# before deploying to mainnet.

# 3. Run dev server
npm run dev
# Open http://localhost:3000
```

## Deploying

| Platform | Guide |
|----------|-------|
| Vercel | Push to `main` — zero config required |
| Docker / bare-metal / nginx | [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) |
| Railway, Render, Fly.io | [docs/DEPLOYMENT.md#5-other-platforms](./docs/DEPLOYMENT.md#5-other-platforms) |

## Env Vars

Each variable is documented with its purpose, valid values, and whether a
rebuild is required directly in [`.env.example`](./.env.example).

| Variable | Required | Rebuild? | Description |
|----------|----------|----------|-------------|
| `NEXT_PUBLIC_STELLAR_NETWORK` | **Yes** | Yes | `testnet` or `mainnet` |
| `NEXT_PUBLIC_CONTRACT_ID` | **Yes** | Yes | Deployed StreamContract address |
| `NEXT_PUBLIC_RPC_URL` | No | Yes | Custom Soroban RPC endpoint (defaults to testnet public RPC) |
| `NEXT_PUBLIC_VITALS_ENDPOINT` | No | No | URL to receive Web Vitals POST payloads |
| `NEXT_PUBLIC_FEE_SPONSOR_ADDRESS` | No | Yes | Stellar public key of fee sponsor for fee-bump transactions |
| `NEXT_PUBLIC_ADMIN_ADDRESSES` | Production | Yes | Comma-separated Stellar public keys allowed to access `/admin` |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | No | Yes | Deprecated alias for `NEXT_PUBLIC_ADMIN_ADDRESSES` |
| `NEXT_PUBLIC_ADMIN_WALLET` | No | Yes | Deprecated alias for `NEXT_PUBLIC_ADMIN_ADDRESSES` |
| `NEXT_PUBLIC_APP_URL` | No | Yes | Base URL for Open Graph / Twitter Card metadata |
| `NEXT_PUBLIC_RPC_DEGRADED_MS` | No | Yes | RPC latency (ms) threshold for degraded indicator (default: `2000`) |
| `NEXT_PUBLIC_RPC_UNREACHABLE_BANNER_S` | No | Yes | Seconds unreachable before full-width banner appears (default: `60`) |
| `NEXT_PUBLIC_CONTRACT_VERSION` | No | Yes | Expected deployed contract version; mismatch shows a refresh banner |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Production | Yes | Web Push VAPID public key; empty falls back to in-tab notifications |

## Web Vitals

The app collects Core Web Vitals (LCP, FID, CLS, TTFB, FCP, INP) via the [`web-vitals`](https://github.com/GoogleChrome/web-vitals) package and reports them using `navigator.sendBeacon`.

### Wiring up a reporting endpoint

1. Set `NEXT_PUBLIC_VITALS_ENDPOINT` in `.env.local`:

   ```
   NEXT_PUBLIC_VITALS_ENDPOINT=https://your-api.example.com/api/vitals
   ```

2. Your endpoint receives `POST` requests with `Content-Type: application/json`:

   ```json
   {
     "name": "LCP",
     "value": 1234.5,
     "rating": "good",
     "delta": 1234.5,
     "id": "v3-1234567890-1234567890",
     "navigationType": "navigate"
   }
   ```

3. In development (no endpoint needed), all vitals are console-logged:

   ```
   [Web Vitals] LCP: 1234 ms (good)
   [Web Vitals] CLS: 0.0012 (good)
   ```

### Alert thresholds

Set alerts on your analytics backend when `rating === "poor"` or when the p75 value exceeds the "Needs Improvement" boundary:

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | ≤ 2500 ms | ≤ 4000 ms | > 4000 ms |
| FID | ≤ 100 ms | ≤ 300 ms | > 300 ms |
| CLS | ≤ 0.1 | ≤ 0.25 | > 0.25 |
| TTFB | ≤ 800 ms | ≤ 1800 ms | > 1800 ms |
| FCP | ≤ 1800 ms | ≤ 3000 ms | > 3000 ms |
| INP | ≤ 200 ms | ≤ 500 ms | > 500 ms |

The implementation lives in `src/lib/vitals.ts` and is mounted via `src/components/WebVitalsReporter.tsx` in the root layout.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Web3 | @sorostream/sdk, @stellar/freighter-api |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Landing page with hero and how-it-works |
| `/dashboard` | Stream list with live balances |
| `/stream/new` | Create stream form |
| `/stream/[id]` | Stream detail with withdraw/cancel |

## Contributing via Drips Wave

This project participates in the **Stellar Wave Program** on [Drips Wave](https://drips.network/wave). Earn rewards for resolving issues during weekly Wave sprints.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full workflow.

> **Note:** Do not start coding until assigned to an issue by a maintainer.

## Handsoff notes

<!-- handsoff-issue-734 -->
- #734: Add test coverage for streamNotificationWatcher firing both thresholds when opened after both have elapsed
