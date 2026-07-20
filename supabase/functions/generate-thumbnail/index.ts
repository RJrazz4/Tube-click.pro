/**
 * Supabase Edge Function — generate-thumbnail — PURGED
 * Image generation removed. Replaced by AI text-based thumbnail prompt generation.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function serve(_handler: (req: Request) => Promise<Response>) {
  return new Response(
    JSON.stringify({ error: "Thumbnail image generation has been purged. Use AI thumbnail prompt generation instead." }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
