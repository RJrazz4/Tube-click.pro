import { useEffect, useRef, useState, type ReactNode } from "react";

interface DeferredModuleProps {
  children: ReactNode;
  /** Keeps layout stable while a below-the-fold module is deferred. */
  minHeight?: number;
  className?: string;
}

/**
 * Delays non-critical dashboard modules until they are near the viewport.
 * This protects mobile FCP and main-thread time without changing the feature.
 */
export function DeferredModule({ children, minHeight = 180, className }: DeferredModuleProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || isReady) return;

    if (!("IntersectionObserver" in window)) {
      setIsReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setIsReady(true);
        observer.disconnect();
      },
      { rootMargin: "360px 0px" },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, [isReady]);

  return (
    <div ref={hostRef} className={className} style={!isReady ? { minHeight } : undefined}>
      {isReady ? children : <div className="deferred-module-placeholder" aria-hidden="true" />}
    </div>
  );
}
