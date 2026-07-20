// Secure CORS — Phase A1
// Production should allow only your Vercel domain + localhost for dev
const ALLOWED_ORIGINS = [
  "https://tube-click.pro",
  "https://www.tube-click.pro",
  "https://tubeclickpro.in",
  "http://localhost:8080",
  "http://localhost:3000",
];

export function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "*";
  // For now allow * with warning, but structure ready for strict check
  // In production, switch to:
  // const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": "*", // TODO: Use allowed in production
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
