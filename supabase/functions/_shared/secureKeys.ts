// Secure key resolver — NO customApiKey from client
// All keys must be set via `supabase secrets set` or Vercel env

export function requireGeminiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY") || "";
  if (!key) throw new Error("GEMINI_API_KEY not configured on server.");
  return key;
}

export function requireFalKey(): string {
  const key = Deno.env.get("FAL_API_KEY") || "";
  if (!key) throw new Error("FAL_API_KEY not configured on server.");
  return key;
}

export function requireElevenLabsKey(): string {
  const key = Deno.env.get("ELEVENLABS_API_KEY") || "";
  if (!key) throw new Error("ELEVENLABS_API_KEY not configured on server.");
  return key;
}

export function jsonResponse(payload: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
