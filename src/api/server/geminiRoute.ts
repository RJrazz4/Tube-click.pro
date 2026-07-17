/**
 * Blueprint for Vercel Edge Route: /api/generate-text
 * This file documents how Gemini integration will work in Next.js/Vercel edge.
 * Current implementation lives in supabase/functions/generate-content which is already secure.
 * 
 * For Vercel migration:
 * - Create app/api/generate-text/route.ts
 * - Copy logic from supabase/functions/generate-content/index.ts
 * - Use process.env.GEMINI_API_KEY (not VITE_)
 */

export const GEMINI_ROUTE_BLUEPRINT = `
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  const { topic, platform, style, language } = await req.json();
  const apiKey = process.env.GEMINI_API_KEY!;
  // ... same logic as supabase function but using NextResponse
}
`;

/**
 * For current Vite app, this is handled via secure Supabase edge client.
 * No client keys — see src/api/client/secureClient.ts
 */
export const SECURE_GEMINI_CONFIG = {
  serverEnv: "GEMINI_API_KEY or GOOGLE_AI_API_KEY",
  clientAccess: "NONE — server only",
  route: "/functions/v1/generate-content",
  futureVercelRoute: "/api/generate-text",
  caching: "React Query staleTime 5m for instant UI",
};
