# Dependencies Audit

## Phase 1: Purge summary

Removed hosted platform infrastructure and generated backend coupling from the repository:

- Removed the platform-specific Vite component tagging wrapper and dependency.
- Removed hosted-platform README copy and publish instructions.
- Removed hosted-platform social metadata from `index.html`.
- Removed the generated Supabase integration client/types from `src/integrations/supabase`.
- Removed the `supabase` directory, including Edge Function source files and function configuration.
- Removed frontend calls to Supabase Edge Functions and replaced them with native TypeScript services under `src/lib/localAiServices.ts` so the app can build without the deleted backend.

## Removed infrastructure references

| Area | Removed dependency/reference | Previous purpose | Replacement status |
| --- | --- | --- | --- |
| Build tooling | `hosted-platform component tagger` | Development-time component tagging wrapper | Removed; Vite now uses only the React SWC plugin. |
| AI gateway | the hosted AI gateway API key and chat-completions endpoint | Hosted AI gateway used by generated Edge Functions | Removed with Edge Functions; direct local API layer pending for non-voice AI tools. |
| Backend functions | `supabase/functions/*` | Generated remote functions for content, thumbnails, vision guides, storyboards, and ElevenLabs TTS | Removed; Voice Studio now uses Puter.js directly, while other AI tools remain guarded by local TypeScript stubs. |
| Frontend backend calls | `supabase.functions.invoke(...)` and direct `/functions/v1/*` fetch calls | Invoked remote Edge Functions from React pages | Removed; pages now call `src/lib/localAiServices.ts`. |
| Supabase client | `@supabase/supabase-js`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Edge Function auth/URL transport | Removed; no runtime Supabase client is required for app initialization. |
| ElevenLabs API key flow | `elevenlabs-api-key` browser setting and serverless ElevenLabs function | Premium TTS through a hosted backend | Removed from Voice Studio; Puter.js provides serverless browser TTS and voice conversion without API keys. |

## Current external services map

| Service | Current app usage | Required for initialization? | Configuration source | Status |
| --- | --- | --- | --- | --- |
| Puter.js | Voice Studio text-to-speech and voice conversion/style transfer | No | Browser script `https://js.puter.com/v2/` | Active; no API key required. |
| Google Gemini API | Planned direct replacement for content generation, thumbnail/storyboard prompt/image flows, and screenshot guide generation | No | Browser localStorage key `gemini-api-key` via settings UI, or `VITE_GEMINI_API_KEY` during local development | Provided by user during setup; do not commit the secret value. |
| Pollinations image endpoint | Fallback thumbnail image generation when AI mode fails or is disabled | No | No API key currently required | Still active as a public fallback endpoint. |
| Browser Web Speech API | Browser-native TTS fallback if needed in future | No | Native browser capability | Available; no key required. |
| Google AdSense / Search Console metadata | Static HTML verification and AdSense metadata | No | Static tags in `index.html` | Still present; no runtime key needed. |

## Missing configuration variables after purge

| Variable/key | Needed by | Notes |
| --- | --- | --- |
| `gemini-api-key` / `VITE_GEMINI_API_KEY` | Local Gemini service implementation for non-voice AI tools | Value received out-of-band during the setup loop. The secret must be entered through local runtime configuration and must not be committed. |

## Setup loop status

- Dependency 1: Google Gemini API Key - Provided by user out-of-band and intentionally not stored in the repository.
- Voice Studio dependency update: Puter.js requires no API key, so the Voice Studio module can proceed without ElevenLabs configuration.
