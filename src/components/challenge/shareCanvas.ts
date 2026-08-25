import type { ChallengeState } from "@/lib/engine/types";

/**
 * Canvas renderer for the 1080x1080 challenge share card. Only ever renders
 * server-verified numbers (streak/day) — no invented claims.
 */

const W = 1080;
const H = 1080;

export function drawShareCard(
  canvas: HTMLCanvasElement,
  data: { streak: number; day: number; bestStreak: number; handle: string },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = W;
  canvas.height = H;

  // Background: deep gradient + subtle grid
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0f1e");
  bg.addColorStop(0.55, "#131a33");
  bg.addColorStop(1, "#1b1035");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(120,140,255,0.07)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Accent glow band
  const glow = ctx.createRadialGradient(W / 2, 380, 40, W / 2, 380, 560);
  glow.addColorStop(0, "rgba(124,92,255,0.32)");
  glow.addColorStop(1, "rgba(124,92,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  // Brand line
  ctx.fillStyle = "#8b93b8";
  ctx.font = "600 30px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("TUBECLICK PRO • 30-DAY VIRAL CHALLENGE", W / 2, 150);

  // Headline number: streak flame size
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 300px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(String(data.streak), W / 2, 470);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "700 52px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`DAY ${data.day} STREAK`, W / 2, 560);

  // Promise line
  ctx.fillStyle = "#e7eaf6";
  ctx.font = "500 44px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("I'm out-publishing my old self", W / 2, 700);
  ctx.fillStyle = "#9aa3c7";
  ctx.font = "500 34px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(`best streak ${data.bestStreak} · data-driven scripts daily`, W / 2, 760);

  // Bracket frame
  ctx.strokeStyle = "rgba(124,92,255,0.6)";
  ctx.lineWidth = 6;
  const m = 70; const arm = 110;
  const corners: Array<[number, number, number, number, number, number]> = [
    [m, m + arm, m, m, m + arm, m],
    [W - m - arm, m, W - m, m, W - m, m + arm],
    [W - m, H - m - arm, W - m, H - m, W - m - arm, H - m],
    [m + arm, H - m, m, H - m, m, H - m - arm],
  ];
  for (const [x1, y1, x2, y2, x3, y3] of corners) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.stroke();
  }

  // Handle + QR placeholder box (appends QR in production build)
  ctx.fillStyle = "#8b93b8";
  ctx.font = "600 30px ui-monospace, monospace";
  ctx.fillText(data.handle || "@tubeclickpro", W / 2, 950);
  ctx.fillStyle = "#6d7597";
  ctx.font = "400 26px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("tubeclickpro.in", W / 2, 995);
}

