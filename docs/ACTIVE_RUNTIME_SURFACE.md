# Active runtime surface

TubeClick Pro's supported browser experience is the React/Vite application in
`src/` and the production Vercel functions in `api/` that are referenced by an
active UI flow. This document is the guardrail for future cleanup work.

## Supported creator flows

- Dashboard, Clone & Crush, Voice Studio, Repurposer, SEO, Analytics, Rewards,
  authentication, and settings
- Text/SEO generation, transcript extraction, Clone & Crush intelligence,
  ElevenLabs voice generation, referral attribution, guest access, and the
  public configuration endpoint

## Retired in the Phase 3 hygiene pass

- Unrouted standalone storyboard, thumbnail, and vision UI modules
- Their client-only orchestration view models and V1 payload adapters
- The unreferenced JSON2Video client/server/webhook prototype
- Duplicate VectorEngine TTS wrapper
- Purged thumbnail, vision, and storyboard-image Vercel endpoints
- Next.js App Router blueprints in this Vite application

New generation capabilities must be designed as a complete vertical slice:
route, server authorization, typed client contract, active UI entry point,
error states, and automated coverage. Do not reintroduce a standalone helper or
public endpoint without an owner and a supported user journey.
