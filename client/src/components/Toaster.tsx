import { useEffect, useState } from 'react'
import { subscribeToasts, dismissToast, type Toast } from '../lib/toast'

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribeToasts(setToasts), [])
  if (!toasts.length) return null
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role="alert" onClick={() => dismissToast(t.id)}>
          <span>{t.message}</span>
          <button className="toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}
