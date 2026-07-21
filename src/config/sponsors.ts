import type { NativeSponsorBannerProps } from "@/components/sponsors/NativeSponsorBanner";

export type SponsorPlacement = "seo" | "voice";

/**
 * Sponsorship inventory is environment-driven so the product never fabricates
 * a partnership. Nothing renders until every required field and an allowlisted
 * HTTPS destination are configured at build time.
 */
export function getSponsorForPlacement(
  placement: SponsorPlacement,
): NativeSponsorBannerProps | null {
  const placements = String(import.meta.env.VITE_SPONSOR_PLACEMENTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  if (!placements.includes(placement)) return null;

  const allowedHosts = String(import.meta.env.VITE_SPONSOR_ALLOWED_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const sponsorName = String(import.meta.env.VITE_SPONSOR_NAME || "").trim();
  const tagline = String(import.meta.env.VITE_SPONSOR_TAGLINE || "").trim();
  const offer = String(import.meta.env.VITE_SPONSOR_OFFER || "").trim();
  const ctaText = String(import.meta.env.VITE_SPONSOR_CTA_TEXT || "").trim();
  const ctaUrl = String(import.meta.env.VITE_SPONSOR_CTA_URL || "").trim();

  if (!sponsorName || !tagline || !offer || !ctaText || !ctaUrl || allowedHosts.length === 0) return null;
  return {
    sponsorName,
    tagline,
    offer,
    ctaText,
    ctaUrl,
    allowedHosts,
    badge: String(import.meta.env.VITE_SPONSOR_BADGE || "Featured Partner").trim(),
  };
}
