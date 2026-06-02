// Pure-CSS wordmark: a metallic-gold gradient serif "finance", a glowing gold
// coin-dot separator, and an italic "thing" for a bit of editorial personality.
export function Brand() {
  return (
    <span className="brand-lockup" aria-label="finance thing">
      <span className="brand-fin">finance</span>
      <span className="brand-sep" aria-hidden="true" />
      <span className="brand-thing">thing</span>
    </span>
  )
}
