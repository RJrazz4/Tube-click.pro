# Environment & Secrets Setup

This document has moved. The canonical reference is:

➡️ **[`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)** — full variable reference, security model, setup instructions for local, Vercel, and Supabase, and key-rotation procedures.

Quick reference for local development:

```bash
cp .env.example .env
# edit .env — never commit it, never prefix a secret with VITE_
npm run dev
```

Headline security rules:

1. **No `VITE_`-prefixed secret.** Anything starting with `VITE_` is inlined into the client bundle.
2. **All AI provider keys, service-role JWTs, and signing secrets live only on the server** (Vercel `process.env` or Supabase `Deno.env`).
3. **Tier and entitlement decisions are enforced server-side.** Client-side gating is UX only.
4. **`.env` is in `.gitignore`.** Use `.env.example` as the template.
