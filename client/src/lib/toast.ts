// Minimal framework-agnostic toast store so any code — React components, the
// API client, or the react-query error caches — can surface a message.
export type ToastType = 'error' | 'info'
export interface Toast {
  id: number
  message: string
  type: ToastType
}

let nextId = 1
let toasts: Toast[] = []
const listeners = new Set<(t: Toast[]) => void>()

function emit() {
  for (const listener of listeners) listener(toasts)
}

export function pushToast(message: string, type: ToastType = 'error') {
  const toast: Toast = { id: nextId++, message, type }
  toasts = [...toasts, toast]
  emit()
  setTimeout(() => dismissToast(toast.id), 6000)
  return toast.id
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(fn: (t: Toast[]) => void) {
  listeners.add(fn)
  fn(toasts)
  return () => {
    listeners.delete(fn)
  }
}
