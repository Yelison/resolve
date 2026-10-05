import { isApiError } from '../../api/client'
import { Button, EmptyState } from '../../components/ui'
import styles from './Page.module.css'
import { PageHeader } from './PageHeader'

export interface SessionErrorPageProps {
  error: unknown
  onRetry: () => void
  /** Hay un reintento en curso: el botón lo indica y no admite más pulsaciones. */
  retrying?: boolean
  /** El último reintento terminó en error: se anuncia a los lectores de pantalla. */
  retryFailed?: boolean
}

/**
 * Sin sesión no se conoce el rol, así que ninguna página puede decidir qué mostrar. En lugar de caer en la vista más
 * restrictiva, el shell muestra este aviso con un reintento.
 */
export function SessionErrorPage({ error, onRetry, retrying = false, retryFailed = false }: SessionErrorPageProps) {
  return (
    <div className={styles.page}>
      <PageHeader title="Sesión no disponible" />
      <EmptyState
        kind="error"
        title="No pudimos cargar tu sesión"
        description={
          isApiError(error)
            ? 'El servidor no respondió como esperábamos. Vuelve a intentarlo en unos segundos.'
            : 'Revisa tu conexión y vuelve a intentarlo.'
        }
        live={retryFailed}
        action={
          <Button variant="secondary" loading={retrying} loadingLabel="Reintentando…" onClick={onRetry}>
            Reintentar
          </Button>
        }
      />
    </div>
  )
}
