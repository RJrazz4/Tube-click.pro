/**
 * Vercel Edge Function — POST /api/ghost/squad-brief
 *
 * Ghost Intel Squad (MP4): runs Scout/Crawler/Analyst/Comparator
 * agents against a competitor video and returns a full threat dossier.
 */
export const runtime = "edge";
export const config = { runtime: "edge" };

import { handleSquadBrief } from "../_squadBrief.js";

export default async function handler(req: Request): Promise<Response> {
  return handleSquadBrief(req);
}
