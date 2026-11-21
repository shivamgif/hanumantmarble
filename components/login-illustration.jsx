// The login page's picture: stock on a shelf, a GST invoice, and a chart whose
// trend ends in a spark (a decision). Drawn with theme tokens, so it follows
// the accent and dark mode without an image file.
export function LoginIllustration({ className = '' }) {
  return (
    <svg viewBox="0 0 420 330" role="img" aria-label="Stock, invoices and insights in one place" className={className}>
      {/* backdrop */}
      <circle cx="220" cy="160" r="138" className="fill-primary/10" />
      <circle cx="330" cy="70" r="26" className="fill-primary/15" />

      {/* shelf with boxes */}
      <g>
        <rect x="40" y="226" width="170" height="8" rx="4" className="fill-foreground/15" />
        <rect x="52" y="170" width="52" height="56" rx="6" className="fill-primary/80" />
        <rect x="66" y="170" width="24" height="12" rx="2" className="fill-card/70" />
        <rect x="108" y="186" width="44" height="40" rx="6" className="fill-primary/45" />
        <rect x="156" y="150" width="42" height="76" rx="6" className="fill-foreground/20" />
        <rect x="168" y="162" width="18" height="6" rx="3" className="fill-card/80" />
        <rect x="112" y="140" width="36" height="42" rx="6" className="fill-primary/25" />
      </g>

      {/* invoice sheet */}
      <g>
        <rect x="196" y="58" width="128" height="164" rx="10" className="fill-card stroke-foreground/15" strokeWidth="1.5" />
        <rect x="212" y="76" width="54" height="8" rx="4" className="fill-primary" />
        <rect x="212" y="94" width="92" height="5" rx="2.5" className="fill-foreground/15" />
        <rect x="212" y="106" width="72" height="5" rx="2.5" className="fill-foreground/15" />
        {[128, 146, 164].map((y) => (
          <g key={y}>
            <rect x="212" y={y} width="56" height="6" rx="3" className="fill-foreground/20" />
            <rect x="282" y={y} width="26" height="6" rx="3" className="fill-foreground/30" />
          </g>
        ))}
        <rect x="212" y="186" width="96" height="1.5" className="fill-foreground/15" />
        <text x="212" y="208" className="fill-foreground/60 text-[11px] font-semibold">GST</text>
        <text x="308" y="208" textAnchor="end" className="fill-primary text-[13px] font-bold">₹ 48,260</text>
      </g>

      {/* chart card, below the invoice so its total stays visible */}
      <g transform="translate(14 46)">
        <rect x="262" y="176" width="130" height="96" rx="10" className="fill-card stroke-foreground/15" strokeWidth="1.5" />
        {[
          [278, 238, 22],
          [298, 228, 32],
          [318, 216, 44],
          [338, 222, 38],
          [358, 204, 56],
        ].map(([x, y, h]) => (
          <rect key={x} x={x} y={y} width="12" height={h} rx="3" className="fill-primary/30" />
        ))}
        <polyline points="284,226 304,214 324,200 344,206 368,186" fill="none" className="stroke-primary" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {/* the decision spark */}
        <circle cx="368" cy="186" r="6" className="fill-primary" />
        <path d="M368 168v-8M368 212v-8M386 186h8M342 186h8M381 173l5-5M350 173l-5-5" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* floating check: done, filed */}
      <circle cx="196" cy="58" r="15" className="fill-primary" />
      <path d="M189 58l5 5 9-10" fill="none" className="stroke-primary-foreground" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
