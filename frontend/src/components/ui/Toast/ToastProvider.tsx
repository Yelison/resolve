import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../../lib/cx'
import { buttonClassName } from '../Button/buttonClassName'
import { Icon } from '../Icon/Icon'
import styles from './Toast.module.css'
import { ToastContext, type ToastAction, type ToastApi, type ToastOptions } from './toastContext'

const DEFAULT_DURATION = 5000

interface ToastItem extends Required<Pick<ToastOptions, 'tone' | 'duration'>> {
  id: string
  title: ReactNode
  description?: ReactNode
  action?: ToastAction
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1
    const id = `toast-${nextId.current}`
    const toast: ToastItem = {
      id,
      tone: options.tone ?? 'success',
      duration: options.duration ?? DEFAULT_DURATION,
      title: options.title,
      description: options.description,
      action: options.action,
    }
    setToasts((current) => [...current, toast])
    return id
  }, [])

  const api = useMemo<ToastApi>(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext value={api}>
      {children}
      {/* La región existe desde el inicio para que los lectores de pantalla anuncien lo que se añade. */}
      <section className={styles.region} aria-label="Notificaciones" aria-live="polite">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const remaining = useRef(toast.duration)

  useEffect(() => {
    if (paused) return
    const startedAt = Date.now()
    const timer = window.setTimeout(() => onDismiss(toast.id), remaining.current)
    return () => {
      window.clearTimeout(timer)
      remaining.current -= Date.now() - startedAt
    }
  }, [paused, onDismiss, toast.id])

  return (
    <div
      className={cx(styles.toast, styles[toast.tone])}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Icon name={toast.tone === 'success' ? 'check' : 'bell'} className={styles.icon} />
      <div className={styles.text}>
        <p id={`${toast.id}-title`} className={styles.title}>
          {toast.title}
        </p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
        {toast.action && (
          <button
            type="button"
            className={buttonClassName({ variant: 'secondary', className: styles.action })}
            aria-label={toast.action.ariaLabel}
            onClick={() => {
              onDismiss(toast.id)
              toast.action?.onSelect()
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.close}
        aria-describedby={`${toast.id}-title`}
        onClick={() => onDismiss(toast.id)}
      >
        Cerrar
      </button>
    </div>
  )
}
