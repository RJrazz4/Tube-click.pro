/**
 * Vercel Edge — /api/webhook/json2video — Phase D2
 * Receives completion notification from JSON2Video when render finishes
 * Payload: { width, height, duration, size, url, project, id }
 * 
 * In production:
 * - Save MP4 URL to user's dashboard (Supabase DB or Zustand store via webhook)
 * - Send email notification via Resend/SendGrid
 * - Update project status to "completed"
 */
export const config = { runtime: 'edge' };

import { jsonResponse, corsHeaders } from '../_shared.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only — JSON2Video webhook' }, 405);

  try {
    const payload = await req.json();
    const { width, height, duration, size, url, project, id } = payload;

    if (!url) return jsonResponse({ error: 'Missing url in webhook payload' }, 400);

    console.log(`[JSON2Video Webhook] Project ${project} completed: ${url} (${width}x${height}, ${duration}s, ${size} bytes)`);

    // TODO: Save to DB, notify user, update dashboard
    // Example: await supabase.from('renders').insert({ project_id: project, video_url: url, duration, size, status: 'completed' })
    // Example: await resend.emails.send({ to: user.email, subject: 'Your video is ready!', html: `<a href="${url}">Download</a>` })

    // For now, just log and return success — JSON2Video expects 200 OK
    return jsonResponse({
      success: true,
      message: 'Webhook received — video ready',
      project,
      videoUrl: url,
      duration,
      size,
      next: 'Save to dashboard, send email notification',
    });

  } catch (e: any) {
    console.error('[JSON2Video Webhook] Error', e);
    return jsonResponse({ error: e.message }, 500);
  }
}
