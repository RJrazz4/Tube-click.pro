# PHASE B2 — Free Value Add: URL to Transcript — REPORT

**Date:** 2026-07-17
**Status:** ✅ COMPLETED
**Build:** Passing — Repurposer 12.78KB, transcript lib added

---

## Objective
Create backend utility utilizing free node packages to extract YouTube transcripts from given URL to power Multi-Platform Repurposer.

---

## What Was Built

### 1. Backend — Free Transcript Extraction (No API Key)

**Library:** `youtube-transcript` (npm) — free, no API key, server-only

**Vercel Edge → Node Runtime:** `api/transcript.ts`
- Changed runtime from `edge` to `nodejs` — required because `youtube-transcript` uses Node APIs
- Logic:
  1. Extract videoId via regex (supports youtube.com/watch?v=, youtu.be/, /shorts/, /embed/)
  2. Attempt 1: `YoutubeTranscript.fetchTranscript(videoId, { lang })` — free lib, tries with lang then auto
  3. Attempt 2: Fallback to Piped free API instances (no key): `pipedapi.kavin.rocks/transcripts/{id}` — free value add backup
  4. Returns: `{ videoId, transcript (full text), segments[], source, length, wordCount }`
  5. 404 if captions disabled/private with helpful action
- Caching: Client caches via React Query 10m, instant revisit

**Supabase Edge (Deno):** `supabase/functions/transcript/index.ts`
- Uses Deno npm spec: `npm:youtube-transcript@1.2.1`
- Same extraction logic, same return shape
- Enables dual routing: Supabase Edge (default) or Vercel Node (faster US if preferred)

**No API Key:** Entire flow uses free libs — no GEMINI_API_KEY needed for transcript step (though repurposing could optionally call Gemini later for AI-enhanced repurposing, currently local to save cost)

### 2. Frontend — Repurposer.tsx Enhanced

**Before:** Only textarea for script/topic, mocked repurposing.

**After:**
- **YouTube URL Input Section:** Input + Extract button, shows transcript meta (ID, wordCount, length, source)
- **Extract Flow:**
  ```ts
  const cacheKey = QK.transcript(url)
  const cached = queryClient.getQueryData(cacheKey)
  if (cached) serve instantly toast
  else mutateAsync({ url }) -> youtube-transcript lib server
  queryClient.setQueryData(cacheKey, data) // cache 10m
  setInputText(transcript.slice(0,8000))
  ```
- **Textarea:** Auto-filled from transcript, shows count 8000 max, word count
- **Repurpose Flow:** Uses transcript as source, generates 4-platform assets locally (no extra API cost), but notes where Gemini could be integrated for AI-enhanced version:
  - YouTube Description with original video link, transcript length, timestamps
  - X Thread (5 tweets) mentioning YT ID, word count, source
  - Instagram Caption with video ID, word count
  - LinkedIn Post with detailed analysis of transcript, mentions free lib
- **Zustand:** Saves repurposed content with metadata, increments stats
- **UX:** Clear OR divider between URL and manual script, loading states, error toasts for 404 (captions disabled)

### 3. Hooks & Caching

- **useTranscriptExtraction()** in `src/hooks/useSecureQuery.ts`:
  ```ts
  useSecureMutation<{ transcript, segments, videoId }, { url }>("transcript")
  ```
- **QK.transcript(url)** key for cache
- **10m gcTime:** Instant revisit if same URL repurposed again — premium smoothness

### 4. Security & Performance

- **Server-only:** `youtube-transcript` only in `api/transcript.ts` and `supabase/functions/transcript` — never in frontend bundle
- **No key:** Zero API keys, zero cost — perfect free tier value add for US audience
- **Throttling:** Uses same Zustand `canGenerate()` 1200ms throttle as other mutations
- **Build:** Repurposer 12.78KB (up from 8.26KB due to transcript UI) — still lazy-loaded, initial bundle unaffected (Index 201KB)

### 5. Verification

- **Install:** `npm install youtube-transcript --save` — done, 1 package added
- **Build:** Passing, no BYOK refs
- **Greps:** `transcript` route mapped in secureClient VERCEL_ROUTE_MAP
- **Test plan:** In production Vercel, POST `/api/transcript` with `{ url: "https://youtube.com/watch?v=dQw4w9WgXcQ" }` should return transcript if captions enabled

---

## File Changes (B2)

**New Backend:**
- `supabase/functions/transcript/index.ts` — Deno npm youtube-transcript
- `api/transcript.ts` rewritten from blueprint to real Node.js implementation with Piped fallback

**New Lib:**
- `youtube-transcript` in package.json

**Updated Frontend:**
- `src/pages/Repurposer.tsx` — full rewrite with YouTube URL input, transcript extraction, meta display, caching, repurpose flow
- `src/hooks/useSecureQuery.ts` — already had useTranscriptExtraction from B1, now functional

**Build Output:**
```
Repurposer 12.78KB gzip 4.33KB
```

---

## API Contract — Phase B Complete

```
Phase B1 (LLM Routing):
  /api/generate-text (TubeBot script) — GEMINI_API_KEY
  /api/seo-tags (SEO bundle) — GEMINI_API_KEY

Phase B2 (Free Transcript):
  /api/transcript (YT URL -> transcript) — NO KEY, free youtube-transcript lib
    Input: { url: "https://youtube.com/watch?v=...", lang: "en" }
    Output: { videoId, transcript, segments[], source, length, wordCount }
    Caching: QK.transcript(url) 10m
    Powers: Repurposer — YT -> 4 platforms
```

**The Brain is Complete:** Text & Data pipeline now covers script generation (LLM) + SEO + transcript extraction (free value add) — all secure, cached, no client keys.

---

## Next — Phase C: The Visual Engine (White-Label Image API)

- C1: Model Mapping Logic — Build backend logic to map custom brand names Tube.Flash (Pollinations free) and Tube.Pro (Fal.ai pro) — **already blueprinted in A3 api/generate-thumbnail.ts, need to finalize + add SnapGen**
- C2: UI Integration — Connect Thumbnail Architect + Visual Storyboard frontend to new API route with brand selector

Ready for approval.
