import { useEffect, useRef, useState } from "react";

/**
 * Phase A2 — Performance: Lazy loading for heavy UI components
 * IntersectionObserver-based image lazy loading.
 * Reduces initial bundle + LCP for Thumbnail Architect & Storyboard
 */

interface UseLazyImageOptions {
  rootMargin?: string;
  threshold?: number;
  placeholder?: string;
}

export function useLazyImage(src: string | null | undefined, options: UseLazyImageOptions = {}) {
  const { rootMargin = "100px", threshold = 0.01, placeholder } = options;
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | null>(placeholder || null);

  useEffect(() => {
    if (!src) return;

    // If IntersectionObserver not available, load immediately
    if (typeof IntersectionObserver === "undefined") {
      setCurrentSrc(src);
      setIsInView(true);
      return;
    }

    const imgEl = imgRef.current;
    if (!imgEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            setCurrentSrc(src);
            observer.disconnect();
          }
        });
      },
      { rootMargin, threshold }
    );

    observer.observe(imgEl);

    return () => observer.disconnect();
  }, [src, rootMargin, threshold]);

  const handleLoad = () => setIsLoaded(true);

  return { imgRef, isLoaded, isInView, currentSrc, handleLoad };
}

// Hook for preloading critical images (e.g., first thumbnail)
export function useImagePreload(urls: string[]) {
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    urls.forEach((url) => {
      if (!url || loaded[url]) return;
      const img = new Image();
      img.src = url;
      img.onload = () => setLoaded((prev) => ({ ...prev, [url]: true }));
      img.onerror = () => setLoaded((prev) => ({ ...prev, [url]: false }));
    });
  }, [urls]);

  return loaded;
}
