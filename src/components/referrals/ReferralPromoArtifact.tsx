import { useRef, useEffect, useState } from "react";
import { buildReferralUrl, getCanonicalDomainDisplay } from "@/lib/domain/canonical";

interface ArtifactProps {
  referralCode: string;
  className?: string;
  showQR?: boolean;
}

/**
 * Referral Promo Artifact - GHOST PROTOCOL v2
 * Pure CSS/SVG + Canvas matrix rain, no external broken image dependency
 * $100/mo illusion: looks like classified keycard from cyberpunk dystopia
 * Zero-budget: SVG + CSS animations + free QR API (qrserver) + canvas rain
 */

export function ReferralPromoArtifact({ referralCode, className = "", showQR = true }: ArtifactProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  const referralUrl = buildReferralUrl(referralCode);
  const displayDomain = getCanonicalDomainDisplay();
  const shortCode = referralCode.toUpperCase();

  // Matrix rain - ultra lightweight canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let drops: number[] = [];
    const chars = "01";
    const fontSize = 12;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      const cols = Math.floor(canvas.width / fontSize);
      drops = Array(cols).fill(0).map(() => Math.random() * -50);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    const draw = () => {
      ctx.fillStyle = "rgba(2, 2, 7, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(34, 211, 238, 0.6)";
      ctx.font = `${fontSize}px monospace`;
      drops.forEach((y, i) => {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * fontSize, y * fontSize);
        if (y * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
        else drops[i] = y + 0.6;
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const handleDownloadSVG = () => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `TubeClick-GHOST-PASS-${shortCode}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async () => {
    if (!svgRef.current) return;
    try {
      const svg = svgRef.current;
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(svg);
      const img = new Image();
      const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1200;
        canvas.height = 630;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.fillStyle = "#020207";
          ctx.fillRect(0,0,1200,630);
          ctx.drawImage(img,0,0,1200,630);
          canvas.toBlob(b => {
            if (!b) return;
            const pngUrl = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = pngUrl;
            a.download = `TubeClick-GHOST-PASS-${shortCode}.png`;
            a.click();
            URL.revokeObjectURL(pngUrl);
          }, "image/png");
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch {}
  };

  return (
    <div
      ref={containerRef}
      className={`referral-artifact relative w-full aspect-[1200/630] rounded-2xl overflow-hidden border border-cyan-400/20 bg-[#020207] shadow-[0_0_40px_rgba(34,211,238,0.15),0_0_80px_rgba(139,92,246,0.10)] group ${className}`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Matrix rain canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full opacity-30" />

      {/* Grid */}
      <div className="absolute inset-0 opacity-[0.06] ghost-grid" />

      {/* Orbs */}
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-cyan-400/15 blur-[40px] pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full bg-purple-600/20 blur-[50px] pointer-events-none" />

      {/* Main SVG */}
      <svg ref={svgRef} viewBox="0 0 1200 630" className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="g1" x1="100" y1="80" x2="1100" y2="550" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7C3AED" stopOpacity="0.9" />
            <stop offset="1" stopColor="#22D3EE" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="gText" x1="0" y1="0" x2="1" y2="0">
            <stop stopColor="#A855F7" />
            <stop offset="1" stopColor="#22D3EE" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background */}
        <rect width="1200" height="630" rx="24" fill="#020207" />
        <path d="M0 540L420 120L690 390L930 64L1200 284V630H0V540Z" fill="url(#g1)" opacity={isHovering ? "0.45" : "0.28"} style={{ transition: "opacity 0.4s" }} />

        {/* Brackets - HUD corners */}
        <path d="M28 28 L28 72 L72 72" stroke="#22D3EE" strokeWidth="2" opacity="0.5" fill="none" />
        <path d="M1172 28 L1172 72 L1128 72" stroke="#A855F7" strokeWidth="2" opacity="0.5" fill="none" />
        <path d="M28 602 L28 558 L72 558" stroke="#A855F7" strokeWidth="2" opacity="0.4" fill="none" />
        <path d="M1172 602 L1172 558 L1128 558" stroke="#22D3EE" strokeWidth="2" opacity="0.4" fill="none" />

        {/* Center bolt */}
        <g transform="translate(900, 300)">
          <circle cx="0" cy="0" r="110" fill="#22D3EE" opacity="0.12" />
          <circle cx="0" cy="0" r="78" stroke="#22D3EE" strokeWidth="2.5" opacity={isHovering ? "0.9" : "0.6"} style={{ transition: "opacity 0.3s" }} />
          <path d="M-16 -70L-58 28H-22L-36 70L56 -17H12L26 -70H-16Z" fill="#A855F7" stroke="#E9D5FF" strokeWidth="4" strokeLinejoin="round" filter="url(#glow)" />
        </g>

        {/* Text stack */}
        <text x="66" y="118" fill="#A855F7" fontFamily="monospace" fontSize="22" fontWeight="700" letterSpacing="6" opacity="0.9">TUBECLICK PRO • GHOST PROTOCOL</text>
        <text x="66" y="204" fill="white" fontFamily="Orbitron, sans-serif" fontSize="56" fontWeight="800" letterSpacing="-1">VIRAL GROWTH</text>
        <text x="66" y="268" fill="#22D3EE" fontFamily="Orbitron, sans-serif" fontSize="56" fontWeight="800">PASS</text>
        <text x="68" y="328" fill="#B8B8C9" fontFamily="monospace" fontSize="20">Invite creators. Unlock Pro. Build momentum.</text>

        {/* Code pill */}
        <rect x="66" y="356" width="460" height="52" rx="26" fill="rgba(124,58,237,0.15)" stroke="rgba(124,58,237,0.35)" strokeWidth="1" />
        <text x="88" y="388" fill="#A855F7" fontFamily="monospace" fontSize="18" fontWeight="700">{shortCode} • LEVEL 4 CLEARANCE • MUM-01</text>

        {/* Domain footer */}
        <text x="66" y="468" fill="#6B7280" fontFamily="monospace" fontSize="16">{displayDomain.toUpperCase()} / REF / {shortCode}</text>
        <text x="66" y="494" fill="#22D3EE" fontFamily="monospace" fontSize="13" opacity="0.7">ENCRYPTED UPLINK • GHOST NODE SYNCED • ₹0 ELITE ACCESS</text>

        {/* CTA pill */}
        <g opacity="0.95">
          <rect x="66" y="520" width="320" height="52" rx="26" fill="#7C3AED" />
          <text x="108" y="552" fill="white" fontFamily="monospace" fontSize="18" fontWeight="700" letterSpacing="1">JOIN THE INTEL LOOP →</text>
        </g>

        {/* QR placeholder box area */}
        <rect x="560" y="360" width="140" height="140" rx="12" fill="white" opacity="0.95" />
        <text x="630" y="440" textAnchor="middle" fill="#020207" fontFamily="monospace" fontSize="10" fontWeight="700">QR • {shortCode}</text>
      </svg>

      {/* Real QR overlay (HTML) - positioned over SVG box - uses free qrserver API */}
      {showQR && (
        <div className="absolute left-[46.6%] top-[57%] w-[11.7%] aspect-square rounded-[10px] overflow-hidden bg-white p-1.5 shadow-[0_0_20px_rgba(255,255,255,0.3)]">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(referralUrl)}&bgcolor=ffffff&color=020207&margin=4`}
            alt={`QR for ${shortCode}`}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>
      )}

      {/* Hover glitch overlay */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-300 ${isHovering ? "opacity-100" : "opacity-0"}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-cyan-400/5 animate-pulse" />
        <div className="absolute inset-0 ghost-scanline opacity-10" />
      </div>

      {/* Download buttons - appear on hover */}
      <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button
          onClick={handleDownloadSVG}
          className="rounded-full bg-black/70 backdrop-blur-md border border-primary/20 px-2.5 py-1 text-[10px] font-mono text-primary hover:bg-primary/20 transition-colors"
        >
          SVG
        </button>
        <button
          onClick={handleDownloadPNG}
          className="rounded-full bg-black/70 backdrop-blur-md border border-cyan-400/20 px-2.5 py-1 text-[10px] font-mono text-cyan-300 hover:bg-cyan-400/20 transition-colors"
        >
          PNG
        </button>
      </div>

      {/* Code watermark */}
      <div className="absolute bottom-2 right-3 text-[8px] font-mono text-muted-foreground/40 tracking-widest">
        GHOST • {shortCode.slice(-4)} • MUM-01
      </div>
    </div>
  );
}
