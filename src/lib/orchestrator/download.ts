/**
 * Phase G3 — Shared download helpers (blob fetch, anchor save, zip).
 *
 * Consolidated from G1's storyboard-local copies so both generation
 * surfaces share one implementation. All helpers fail soft (null /
 * partial zip) — a single broken image must not sink an export.
 */
import JSZip from "jszip";

/** Best-effort blob fetch (data URLs and cross-origin URLs alike). */
export async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

/** Save a Blob via a temporary object URL. */
export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

/** Download one image by URL (fetched, then saved). Returns success. */
export async function downloadImage(url: string, filename: string): Promise<boolean> {
  const blob = await fetchBlob(url);
  if (blob === null) return false;
  downloadBlob(blob, filename);
  return true;
}

export interface ZipImageEntry {
  url: string;
  filename: string;
}

/**
 * Zip a set of image URLs and save the archive. Returns how many images
 * actually made it in (0 = nothing downloadable; caller saves nothing).
 */
export async function downloadZip(entries: readonly ZipImageEntry[], zipName: string): Promise<number> {
  const zip = new JSZip();
  let added = 0;
  for (const entry of entries) {
    const blob = await fetchBlob(entry.url);
    if (blob !== null) {
      zip.file(entry.filename, blob);
      added += 1;
    }
  }
  if (added === 0) return 0;
  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, zipName);
  return added;
}
