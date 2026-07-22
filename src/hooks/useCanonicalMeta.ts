import { useEffect } from "react";
import { getCanonicalRoot } from "@/lib/domain/canonical";

/**
 * Ensures OG and canonical always point to tubeclickpro.in, never vercel.app
 * Zero-budget, client-side meta enforcement
 */

export function useCanonicalMeta() {
  useEffect(() => {
    try {
      const canonicalRoot = getCanonicalRoot();
      // Enforce canonical link
      let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      if (window.location.pathname.startsWith("/ref/")) {
        link.href = `${canonicalRoot}${window.location.pathname}`;
      } else {
        link.href = `${canonicalRoot}/`;
      }

      // Enforce OG URL
      let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
      if (ogUrl) {
        ogUrl.content = link.href;
      }

      // Enforce OG image to use canonical domain artifact (existing referral-banner.svg is canonical)
      let ogImage = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
      if (ogImage && ogImage.content.includes("vercel.app")) {
        ogImage.content = `${canonicalRoot}/TubeGenius_app_icon_202604081246.jpeg`;
      }
    } catch {}
  }, []);
}
