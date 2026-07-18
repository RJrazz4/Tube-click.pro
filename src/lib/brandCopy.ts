/**
 * Phase G2 — True White-Label Brand Copy
 *
 * Single source of truth for every user-facing string about our AI engine.
 * RULE: Users only ever see brand tiers — Tube.Flash / Tube.Pro / Tube.Cinematic.
 * Underlying infrastructure is never named anywhere in UI copy.
 *
 * `accent` / `accentHex` feed the Phase G3 3D processing state.
 */

export type BrandTier = "Tube.Flash" | "Tube.Pro" | "Tube.Cinematic";

export interface BrandTierCopy {
  /** One-word quality signal shown next to the brand name */
  tagline: string;
  /** Longer marketing blurb for tier cards / empty states */
  blurb: string;
  /** Accent token + hex used by tier accents and the G3 Processing3D animation */
  accent: "cyan" | "violet" | "amber";
  accentHex: string;
}

export const BRAND_TIERS: Record<BrandTier, BrandTierCopy> = {
  "Tube.Flash": {
    tagline: "Instant",
    blurb: "Ultra-fast drafts in a few seconds — perfect for rapid thumbnail and storyboard iteration.",
    accent: "cyan",
    accentHex: "#22d3ee",
  },
  "Tube.Pro": {
    tagline: "Pro-grade",
    blurb: "Higher-fidelity output with enhanced detail — the everyday workhorse for serious creators.",
    accent: "violet",
    accentHex: "#a78bfa",
  },
  "Tube.Cinematic": {
    tagline: "Cinema-grade",
    blurb: "Maximum-detail cinematic rendering for hero thumbnails and high-CTR storyboard frames.",
    accent: "amber",
    accentHex: "#fbbf24",
  },
};

const FALLBACK_COPY: BrandTierCopy = {
  tagline: "Managed",
  blurb: "Fully managed AI engine.",
  accent: "cyan",
  accentHex: "#22d3ee",
};

export const brandCopy = (brand: string): BrandTierCopy =>
  (BRAND_TIERS as Record<string, BrandTierCopy>)[brand] ?? FALLBACK_COPY;

export const brandTagline = (brand: string): string => brandCopy(brand).tagline;

export const brandBlurb = (brand: string): string => brandCopy(brand).blurb;

/** Shared managed-engine copy snippets used across pages */
export const ENGINE_COPY = {
  managed: "Engine selection is fully managed — you only choose a brand tier.",
  managedHint:
    "Fully managed AI engine — no setup, no configuration. Everything runs securely server-side.",
  brandOnly: (brand: string) => `${brand} • ${brandTagline(brand)}`,
};
