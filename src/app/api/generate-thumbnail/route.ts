/**
 * Next.js App Router — /app/api/generate-thumbnail/route.ts
 * Maps Tube.Flash (Pollinations free) vs Tube.Pro (Fal.ai)
 * Blueprint — see api/generate-thumbnail.ts
 */
export const runtime = 'edge';

export async function POST(req: Request) {
  return new Response(JSON.stringify({ message: "Blueprint — see api/generate-thumbnail.ts" }), {
    headers: { "Content-Type": "application/json" },
  });
}
