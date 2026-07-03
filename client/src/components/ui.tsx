import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { BudgetBucket } from '../api/types'

// The 50/30/20 buckets ARE the primary categories — three fixed options, never created.
export const BUCKETS: { value: BudgetBucket; label: string; cls: string }[] = [
  { value: 'ESSENTIAL', label: 'Needs', cls: 'warn' },
  { value: 'DISCRETIONARY', label: 'Wants', cls: 'info' },
  { value: 'SAVINGS', label: 'Savings', cls: 'good' },
]
const BUCKET_BY_VALUE = Object.fromEntries(BUCKETS.map((b) => [b.value, b]))

/** Segmented Needs/Wants/Savings picker. Always available — nothing to create. */
export function BucketSelect({
  value,
  onChange,
}: {
  value: BudgetBucket | ''
  onChange: (v: BudgetBucket) => void
}) {
  return (
    <div className="seg">
      {BUCKETS.map((b) => (
        <button
          type="button"
          key={b.value}
          className={`seg-btn ${value === b.value ? 'active' : ''}`}
          onClick={() => onChange(b.value)}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

export function BucketBadge({ bucket }: { bucket: BudgetBucket | null }) {
  if (!bucket) return <span className="badge neutral">unbucketed</span>
  const b = BUCKET_BY_VALUE[bucket]
  return <span className={`badge ${b.cls}`}>{b.label}</span>
}

export function Card({
  children,
  className = '',
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <div className={`card ${className}`} onClick={onClick}>
      {children}
    </div>
  )
}

export function Stat({
  label,
  value,
  tone,
  sub,
  to,
}: {
  label: string
  value: ReactNode
  tone?: 'pos' | 'neg' | 'accent'
  sub?: ReactNode
  to?: string
}) {
  const inner = (
    <>
      <div className="stat-label">{label}</div>
      <div className={`stat-value num ${tone ?? ''}`}>{value}</div>
      {sub != null && <div className="stat-sub">{sub}</div>}
      {to && <span className="stat-arrow">→</span>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className="card stat-card clickable">
        {inner}
      </Link>
    )
  }
  return <Card className="stat-card">{inner}</Card>
}

// Right-aligned amount with a small caption beneath it so a bare number is
// never ambiguous (e.g. a debt's balance vs. its monthly payment).
export function AmountCell({
  value,
  label,
  tone,
}: {
  value: ReactNode
  label?: string
  tone?: 'pos' | 'neg'
}) {
  return (
    <div className="amt-cell">
      <div className={`amt num ${tone ?? ''}`}>{value}</div>
      {label && <div className="amt-cap">{label}</div>}
    </div>
  )
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {action}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>
}

export function Loading() {
  return <div className="loading">Loading…</div>
}

export function Bar({ pct, tone = 'accent' }: { pct: number; tone?: string }) {
  const color =
    tone === 'pos' ? 'var(--positive)'
    : tone === 'neg' ? 'var(--negative)'
    : tone === 'info' ? 'var(--indigo)'
    : 'var(--accent)'
  return (
    <div className="bar">
      <span style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  )
}

/** Pencil icon button with an accessible name. */
export function EditButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="iconbtn" aria-label={label} title={label} onClick={onClick}>
      ✎
    </button>
  )
}

/**
 * Two-step destructive button: first click arms it ("Sure?"), second click
 * within 2.5s confirms. Guards every delete in the app against mis-taps.
 */
export function DeleteButton({ onDelete, label }: { onDelete: () => void; label: string }) {
  const [arming, setArming] = useState(false)
  useEffect(() => {
    if (!arming) return
    const t = setTimeout(() => setArming(false), 2500)
    return () => clearTimeout(t)
  }, [arming])
  return (
    <button
      type="button"
      className={`iconbtn ${arming ? 'confirming' : ''}`}
      aria-label={arming ? `Confirm — ${label}` : label}
      title={label}
      onClick={() => (arming ? onDelete() : setArming(true))}
    >
      {arming ? 'Sure?' : '✕'}
    </button>
  )
}

// Number input adorned with a leading $ for dollar values.
export function MoneyInput({
  value,
  onChange,
  required,
  min = '0',
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  required?: boolean
  min?: string
  placeholder?: string
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}>$</span>
      <input
        className="input num"
        type="number"
        step="0.01"
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        style={{ paddingLeft: 22 }}
      />
    </div>
  )
}

export function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

// Native <dialog> — Escape, focus containment, ::backdrop, and scroll lock
// come from the platform instead of JS.
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    ref.current?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Clicks that land outside the dialog's box hit the ::backdrop region.
  const onBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose()
  }

  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={(e) => {
        e.preventDefault() // let React unmount it instead of a silent native close
        onClose()
      }}
      onClick={onBackdropClick}
    >
      <h3>{title}</h3>
      {children}
    </dialog>
  )
}
