/**
 * Vercel Edge Function — POST /api/ghost/dawn-patrol-mark-read
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleDawnPatrolMarkRead } from "../_dawnPatrol.js";

export default async function handler(req: Request): Promise<Response> {
  return handleDawnPatrolMarkRead(req);
}
