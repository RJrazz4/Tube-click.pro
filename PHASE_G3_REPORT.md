# Phase G3 — Unique 3D Processing State

**Commit:** *(this commit)* · **Branch:** `main` (direct push, no PR) · **Date:** 2026-07-18
**Verification:** `npm run verify` → **4/4 gates GREEN, 0 warnings**

---

## 1. Mission

Replace all standard loaders (`<Progress>` bars, `Loader2` spinners) during image
generation with a unique, modern, premium **3D processing** animation.

## 2. New component — `src/components/ui/Processing3D.tsx`

Signature stack (pure CSS, zero dependencies, styles self-injected once):

| Element | Implementation |
|---|---|
| **3D cube** | `transform-style: preserve-3d`, 6 accent-tinted faces, `p3d-tumble` 5.2s dual-axis rotation in a 640px perspective stage |
| **Scan beam** | Blurred accent gradient sweeping top→bottom (`p3d-scan` 2.1s) — "AI is scanning/rendering" feel |
| **Progress ring** | SVG circle, accent stroke, smooth `stroke-dashoffset` transition + live % (inline/overlay, when `progress` provided) |
| **Stage microcopy** | Cycles every 1.4s: *Analyzing prompt → Composing frames → Rendering pixels → Polishing details* with fade-slide re-entry |
| **Ambient glow** | Radial accent halo behind the cube |

**Variants:** `inline` (generation blocks), `tile` (grid cells, label option),
`overlay` (fullscreen glass panel — ready for future use).

**Brand accents** — wired to G2 `brandCopy.ts`:

| Brand | Accent |
|---|---|
| Tube.Flash | cyan `#22d3ee` |
| Tube.Pro | violet `#a78bfa` |
| Tube.Cinematic | amber `#fbbf24` |

**Accessibility:** `prefers-reduced-motion` → cube/beam/stage animations disabled,
static cube + first stage. No layout shift (fixed composite box).

## 3. Integrations (8 edits / 2 files)

| Location | Before | After |
|---|---|---|
| `Thumbnails.tsx` progress block | `<Progress>` bar + text | `<Processing3D variant="inline" progress brand subLabel="n/4 complete • brand • tagline">` |
| `Thumbnails.tsx` tile spinner | `Loader2 w-6` | `<Processing3D variant="tile" size="sm" brand>` |
| `Storyboard.tsx` progress block | `<Progress>` bar + text | `<Processing3D variant="inline" progress brand subLabel="n/N scenes • retry info">` |
| `Storyboard.tsx` scene spinner | `Loader2 w-8` + status | `<Processing3D variant="tile" size="md" brand label={getStatusText(scene)}>` |
| Both pages | `import { Progress }` | removed (fully replaced) |

Button-level `Loader2` spinners (form submits, J2V export) intentionally kept —
they're tiny button affordances, not generation-state visuals.

## 4. Verification evidence (`node scripts/verify.mjs`)

```
[Gate 1] api/ import extensions ... ✅ 16 api files
[Gate 2] tsc api + app ............ ✅ 0 errors / 0 errors
[Gate 3] vite build ............... ✅ passed
[Gate 4] provider-leak scan ....... ✅ 0 hits (hard-enforced)
RESULT: 0 failed gate(s), 0 warning(s)
```

## 5. Phase G — COMPLETE

| Phase | Scope | Status |
|---|---|---|
| G1 | Verification gates + PR #9 merge infections | ✅ `ee0875a`/`f700acd` |
| G2 | True white-labeling + hard leak guard | ✅ `db9e0e1` |
| G3 | 3D processing state | ✅ this commit |
