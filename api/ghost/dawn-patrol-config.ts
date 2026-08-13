/**
 * Vercel Edge Function — GET/POST /api/ghost/dawn-patrol-config
 *
 * Get or set caller's Dawn Patrol preferences (enabled, send_hour UTC).
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleDawnPatrolConfig } from "../_dawnPatrol.js";

export default async function handler(req: Request): Promise<Response> {
  return handleDawnPatrolConfig(req);
}
