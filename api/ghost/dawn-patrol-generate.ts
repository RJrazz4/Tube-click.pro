/**
 * Vercel Edge Function — POST /api/ghost/dawn-patrol-generate
 *
 * Generate today's Dawn Patrol brief for the caller: headline + 3
 * competitive bullets, persisted server-authoritatively.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleDawnPatrolGenerate } from "../_dawnPatrol.js";

export default async function handler(req: Request): Promise<Response> {
  return handleDawnPatrolGenerate(req);
}
