/**
 * Vercel Edge Function — POST /api/ghost/dawn-patrol-cron
 *
 * Server-to-server webhook invoked by pg_cron (or an external scheduler)
 * to dispatch Dawn Patrol briefs to due users at their configured UTC
 * send-hour. Protected by DAWN_PATROL_CRON_SECRET/CRON_SECRET.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleDawnPatrolCron } from "../_dawnPatrol.js";

export default async function handler(req: Request): Promise<Response> {
  return handleDawnPatrolCron(req);
}
