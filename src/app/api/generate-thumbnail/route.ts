/**
 * Next.js App Router — /app/api/generate-thumbnail/route.ts — PURGED
 * Thumbnail image generation removed. Use AI thumbnail prompt generation instead.
 */
export const runtime = 'edge';

export async function POST(_req: Request) {
  return new Response(
    JSON.stringify({ error: "Thumbnail image generation has been purged. Use AI thumbnail prompt generation instead." }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}
