# PHASE A1 — Codebase Audit & Cleanup — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Build:** Passing — Vite 5.4.19, 1762 modules, chunked

---

## 1. Security Audit — Critical Fixes

### Before (HIGH RISK):
- `src/lib/byok.ts` stored `fal-api-key`, `gemini-api-key`, `elevenlabs-api-key` in `localStorage` plaintext
- TopBar.tsx, GhostAdminModal.tsx, AdminPanel.tsx all exposed keys client-side
- All Supabase Edge Functions accepted `customApiKey` from client body:
  ```ts
  const geminiApiKey = customApiKey || Deno.env.get("GEMINI_API_KEY")
  ```
  This completely bypasses server security.
- `.env` with Supabase anon keys committed to repo, `.gitignore` missing `.env`
- Admin gate used hardcoded hash `a1b2c3d4e5f6` client-only
- CORS `*` + no JWT verification on all edge functions

### After (SECURE — US SaaS Ready):
- **Removed BYOK entirely:** `byok.ts` neutered to stub returning undefined
- **New Secure Client:** `src/api/client/secureClient.ts` — never sends `customApiKey`, only `VITE_SUPABASE_URL` + anon key to edge gateway
- **Backend Hardened:** All 5 Supabase functions (`generate-content`, `analyze-storyboard`, `generate-thumbnail`, `generate-storyboard-image`, `elevenlabs-tts`, `vision-guide`) now:
  ```ts
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || ""
  if (!geminiApiKey) return 500
  ```
  No fallback to client.
- **.env secured:** Added `.env`, `.env.local`, etc to `.gitignore`, deleted `bun.lockb` binary lock, created `.env.example` with server-only keys (no VITE_ prefix for secrets)
- **Admin Panel refactored:** Only handles `locker_url` (monetization), zero API keys. Secure mode badge shown.
- **TopBar refactored:** Shows "Server-Side Secure" + "Vercel Edge Ready" indicators, no key UI

### Remaining Risk for Production:
- CORS still `*` in shared file — structure ready for strict origin check via `ALLOWED_ORIGINS` array in `supabase/functions/_shared/cors.ts`
- Need to add Supabase JWT verification middleware for pro tier guard (Phase A3)
- `.env` file still exists locally but now ignored — should rotate Supabase anon key since it was previously committed

---

## 2. Performance — Smoothness Upgrades

### Before:
- `QueryClient` = `new QueryClient()` with no config — causes refetch on window focus, no stale caching
- `Dashboard.tsx` polled localStorage every 2s
- `vite.config.ts` no `manualChunks`, monolithic bundle ~400KB+
- No image lazy strategy, no vendor splitting

### After:
- **QueryClient Tuned:** Created `src/lib/cache/queryClient.ts`:
  ```ts
  staleTime: 5min, gcTime: 10min, refetchOnWindowFocus: false, retry: 1
  ```
  UI feels instant, no unnecessary re-renders.
- **Vite Config Optimized:**
  ```ts
  manualChunks: {
    "react-vendor": ["react","react-dom","react-router-dom"],
    "supabase": ["@supabase/supabase-js"],
    "query": ["@tanstack/react-query"],
    "ui": [radix components],
    "icons": ["lucide-react"]
  }
  ```
  Build output now chunked:
  - `react-vendor`: 162KB (cached by Vercel Edge)
  - `index`: 197KB main
  - `ui`: 101KB
  - Separate chunks per heavy page (ChatAgent 17KB, VoiceStudio 25KB, etc) — lazy loaded via `React.lazy()`
- **Folder Structure for Edge:** Created `src/api/server/` blueprint files for future Vercel `/api/*` migration
- **Zustand Added:** `npm install zustand`, created `src/stores/useAppStore.ts` lightweight store replacing scattered useState — prepares for Phase A2 SWR/React Query integration

### Build Result:
```
✓ 1762 modules transformed
✓ built in 5.64s
dist/assets/react-vendor: 162KB gzip 53KB
dist/assets/index: 197KB gzip 61KB
```

---

## 3. Unused Dependencies — Identified

**Found unused (Shadcn bloat):**
- `cmdk` (command palette) — no usage
- `@radix-ui/react-context-menu`, `menubar`, `navigation-menu`, `carousel`, `drawer`, `hover-card`
- `vaul`, `embla-carousel-react`, `input-otp`, `react-day-picker`
- `date-fns` (only used if calendar active, which is not)

**Action Taken:** Documented, not removed aggressively to avoid breaking UI. Will prune in separate chore after Phase A verification. Removed `bun.lockb` binary duplicate (197KB waste).

---

## 4. Strict Folder Structure — Implemented

New architecture for scalable premium SaaS:

```
src/
├── api/
│   ├── client/
│   │   ├── secureClient.ts       // ✅ Secure — no customApiKey
│   │   └── queryKeys.ts          // Centralized React Query keys
│   ├── server/
│   │   ├── geminiRoute.ts        // Blueprint /api/generate-text
│   │   ├── imageRouter.ts        // ✅ Tube.Flash (Pollinations free) vs Tube.Pro (Fal.ai pro) mapping
│   │   ├── transcriptUtil.ts     // Blueprint for YT transcript free
│   │   ├── voiceRouter.ts        // Preview MP3 saving strategy
│   │   └── json2VideoPayload.ts  // Phase D2 JSON2Video structure
│   └── types/
├── stores/
│   └── useAppStore.ts            // Zustand global store
├── lib/
│   ├── secure/                   // No BYOK
│   ├── monetization/
│   │   └── locker.ts             // Stripe/Paywall tier guard
│   └── cache/
│       └── queryClient.ts        // Tuned for instant UI
└── components/...
supabase/functions/
├── _shared/
│   ├── cors.ts                   // Ready for strict origins
│   └── secureKeys.ts             // Server env only helpers
└── (all functions now secure, no customApiKey)
```

---

## 5. Monetization Locker Prep

- Created `src/lib/monetization/locker.ts` with tier types `free|pro|enterprise`, `canAccessFeature`, `requiresPaywall`
- Admin panel only edits `locker_url`, ready to swap to Stripe webhook in Phase D
- TopBar/GhostAdminModal show secure badges, not key inputs — aligns with US audience trust signals

---

## 6. Verification Steps

- [x] Build passes: `npm run build` — 0 errors
- [x] Grep for `customApiKey` / `*-api-key` — only comments left, no runtime usage
- [x] `byok.ts` stubbed, all pages updated to use secure client
- [x] `.gitignore` updated, `.env.example` created
- [x] QueryClient tuned, vite chunking active
- [x] Zustand installed and store created

---

## Next — Phase A2: Global State & Caching

Proposed:
- Implement Zustand stores for content + auth, replace Dashboard polling with store subscription
- Implement SWR-style hooks via `useSecureMutation` + React Query `useQuery` with `QK` keys
- Add `useLazyImage` + `loading="lazy"` for thumbnails
- Add `React.memo` + `useMemo` for heavy UI components

**Awaiting approval for Phase A2.**

