/**
 * Official-style USDT (Tether) mark as an inline SVG.
 *
 * Tether green circle (#26A17B) with the white "₮" glyph drawn via paths so it
 * renders identically on every platform (no font dependency on U+20AE).
 *
 * Two exports:
 *   - <UsdtLogo />   : crisp React SVG for inline use
 *   - USDT_LOGO_DATA_URI : data URI for embedding inside the QR code center
 */
const USDT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<circle cx="32" cy="32" r="30" fill="#26A17B"/>' +
  '<rect x="17" y="13" width="30" height="8" rx="2" fill="#ffffff"/>' +
  '<rect x="27" y="13" width="10" height="34" rx="2" fill="#ffffff"/>' +
  '<rect x="17" y="31" width="30" height="8" rx="2" fill="#ffffff"/>' +
  '</svg>';

export const USDT_LOGO_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(USDT_SVG)}`;

export function UsdtLogo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="USDT (Tether)"
    >
      <circle cx="32" cy="32" r="32" fill="#26A17B" />
      <rect x="17" y="13" width="30" height="8" rx="2" fill="#ffffff" />
      <rect x="27" y="13" width="10" height="34" rx="2" fill="#ffffff" />
      <rect x="17" y="31" width="30" height="8" rx="2" fill="#ffffff" />
    </svg>
  );
}
