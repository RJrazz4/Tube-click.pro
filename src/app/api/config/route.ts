/**
 * Next.js App Router — /app/api/config/route.ts
 * Public config, no secrets
 */
export const runtime = 'edge';

export async function GET() {
  return new Response(
    JSON.stringify({
      lockerUrl: process.env.LOCKER_URL || "",
      features: { transcript: true, thumbnails: true, voice: true },
      version: '2.0-secure',
    }),
    { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
  );
}
