# Secure Architecture — No BYOK

- Client never holds API keys.
- All keys are in Deno.env on Supabase Edge or process.env on Vercel Edge.
- Frontend only uses VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY (anon).
