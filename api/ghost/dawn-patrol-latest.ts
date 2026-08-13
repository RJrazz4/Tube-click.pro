/**
 * Vercel Edge Function — GET /api/ghost/dawn-patrol-latest?n=N
 *
 * Fetch the caller's most recent Dawn Patrol briefs (default 5, max 30).
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleDawnPatrolLatest } from "../_dawnPatrol.js";

export default async function handler(req: Request): Promise<Response> {
  return handleDawnPatrolLatest(req);
}
