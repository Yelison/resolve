import { useEffect } from 'react'
import { Alert, Button } from '../../components/ui'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import { DEMO_MAINTENANCE_MESSAGE } from '../../lib/mutationError'
import styles from './DemoMaintenanceNotice.module.css'

export interface DemoMaintenanceNoticeProps {
  /** Relee `/me`: si la demostración ya volvió, la primera respuesta correcta retira el aviso. */
  onRetry: () => void
  retrying: boolean
}

/**
 * Aviso global del reinicio de la demostración (`503` «Reinicio de la demostración en curso»). No es el error genérico
 * de conexión ni el «Recurso ocupado» de un formulario: afecta a toda la API y no hay nada que corregir. No toca la
 * página, así que lo que la persona estaba escribiendo se conserva.
 */
export function DemoMaintenanceNotice({ onRetry, retrying }: DemoMaintenanceNoticeProps) {
  // Si el aviso se va con el foco en «Reintentar» (la demostración volvió), el foco pasa al título de la página.
  useEffect(() => focusPageHeadingIfFocusLost, [])
  return (
    <Alert tone="amber" title="Reinicio de la demostración en curso" live className={styles.notice}>
      <p>{DEMO_MAINTENANCE_MESSAGE}</p>
      <Button
        variant="secondary"
        loading={retrying}
        loadingLabel="Reintentando…"
        aria-label="Reintentar la conexión con la demostración"
        onClick={onRetry}
      >
        Reintentar
      </Button>
    </Alert>
  )
}
