import { useEffect, useState } from 'react'
import { Alert, Button } from '../components/ui'
import { isLockTimeout, LOCK_RETRY_DELAY_MS, LOCK_TIMEOUT_MESSAGE } from './mutationError'

export interface LockTimeoutAlertProps {
  /** Error de la mutación; solo un `503` de «Recurso ocupado» muestra el aviso. */
  error: unknown
  /** La mutación se está repitiendo: el aviso sigue en pantalla y el botón queda ocupado. */
  pending: boolean
  /** Repite el envío anterior (`useRepeatableSubmission().retry`). */
  onRetry: () => void
  /** Qué se repite, en infinitivo («guardar el ticket»): da al botón un nombre accesible propio en cada pantalla. */
  what: string
  className?: string
}

/**
 * Aviso del `503` de bloqueo con la acción «Reintentar», compartido por todas las escrituras que el contrato declara
 * con ese estado. Se monta siempre junto al formulario (no devuelve nada si no hay nada que avisar) y no reintenta por
 * su cuenta: lo decide la persona. El botón no se activa hasta pasado `Retry-After` y usa `aria-disabled` para no
 * perder el foco. Mientras se repite, el aviso y el botón siguen montados (la mutación vacía su error al empezar), así el
 * foco no cae en `body`. Quien lo usa no debe mostrar a la vez el aviso genérico del mismo error.
 */
export function LockTimeoutAlert({ error, pending, onRetry, what, className }: LockTimeoutAlertProps) {
  const lock = isLockTimeout(error)
  const [shown, setShown] = useState(false)
  const visible = lock || (pending && shown)
  if (visible !== shown) setShown(visible)

  // El error en el que ya pasó la espera: cada fallo nuevo es otro objeto y vuelve a esperar.
  const [waitedFor, setWaitedFor] = useState<unknown>(null)
  useEffect(() => {
    if (!lock) return undefined
    const timer = setTimeout(() => setWaitedFor(error), LOCK_RETRY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [lock, error])
  const waiting = lock && waitedFor !== error

  if (!visible) return null
  return (
    <Alert tone="amber" title="Recurso ocupado" live className={className}>
      <p>{LOCK_TIMEOUT_MESSAGE}</p>
      <Button
        variant="secondary"
        loading={pending}
        loadingLabel="Reintentando…"
        aria-disabled={waiting || undefined}
        aria-label={`Reintentar ${what}`}
        onClick={() => {
          if (!waiting) onRetry()
        }}
      >
        Reintentar
      </Button>
    </Alert>
  )
}
