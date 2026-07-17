import { memo } from "react";
import { useLazyImage } from "@/hooks/useLazyImage";
import { cn } from "@/lib/utils";
import { Image as ImageIcon } from "lucide-react";

interface LazyImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  aspectRatio?: "16:9" | "9:16" | "square" | "video";
  placeholderRootMargin?: string;
}

export const LazyImage = memo(function LazyImage({
  src,
  alt,
  className,
  imgClassName,
  aspectRatio = "16:9",
  placeholderRootMargin = "200px",
}: LazyImageProps) {
  const { imgRef, isLoaded, currentSrc, handleLoad } = useLazyImage(src, {
    rootMargin: placeholderRootMargin,
  });

  const aspectClass =
    aspectRatio === "16:9"
      ? "aspect-video"
      : aspectRatio === "9:16"
      ? "aspect-[9/16]"
      : aspectRatio === "square"
      ? "aspect-square"
      : "aspect-video";

  return (
    <div className={cn("relative overflow-hidden bg-secondary/50", aspectClass, className)}>
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center animate-pulse bg-secondary">
          <ImageIcon className="w-6 h-6 text-muted-foreground/30" />
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef as any}
        src={currentSrc || undefined}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={handleLoad}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isLoaded ? "opacity-100" : "opacity-0",
          imgClassName
        )}
      />
    </div>
  );
});
