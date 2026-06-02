// The mark riffs on the app's signature allocation waterfall: gold bars
// stepping down and narrowing — income divided into buckets down to what's left.
export function Brand({ size = 26 }: { size?: number }) {
  return (
    <span className="brand-lockup">
      <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="ft-chip" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ffffff" stopOpacity="0.13" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="ft-bar" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#ffc862" />
            <stop offset="1" stopColor="#f5b13d" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#ft-chip)" stroke="rgba(255,255,255,0.16)" />
        <rect x="8" y="8.5" width="16" height="3.6" rx="1.8" fill="url(#ft-bar)" />
        <rect x="8" y="14.2" width="12" height="3.6" rx="1.8" fill="url(#ft-bar)" opacity="0.82" />
        <rect x="8" y="19.9" width="7.5" height="3.6" rx="1.8" fill="url(#ft-bar)" opacity="0.6" />
      </svg>
      <span className="brand-word">finance<span className="brand-dot">·</span>thing</span>
    </span>
  )
}
