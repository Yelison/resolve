import { isApiError } from '../../api/client'
import { Button, EmptyState } from '../../components/ui'
import styles from './Page.module.css'
import { PageHeader } from './PageHeader'

export interface SessionErrorPageProps {
  error: unknown
  onRetry: () => void
  /** Hay un reintento en curso: el botón lo indica y no admite más pulsaciones. */
  retrying?: boolean
  /** El reintento está en pausa porque no hay conexión: arrancará solo al recuperarla. */
  waiting?: boolean
  /** El último reintento terminó en error: se anuncia a los lectores de pantalla. */
  retryFailed?: boolean
}

/**
 * Sin sesión no se conoce el rol, así que ninguna página puede decidir qué mostrar. En lugar de caer en la vista más
 * restrictiva, el shell muestra este aviso con un reintento.
 */
export function SessionErrorPage({
  error,
  onRetry,
  retrying = false,
  waiting = false,
  retryFailed = false,
}: SessionErrorPageProps) {
  return (
    <div className={styles.page}>
      <PageHeader title="Sesión no disponible" />
      <EmptyState
        kind="error"
        title="No pudimos cargar tu sesión"
        description={describe(error)}
        live={retryFailed}
        action={
          <Button
            variant="secondary"
            loading={retrying}
            loadingLabel={waiting ? 'Esperando conexión…' : 'Reintentando…'}
            onClick={onRetry}
          >
            Reintentar
          </Button>
        }
      />
    </div>
  )
}

function describe(error: unknown) {
  // Hasta que exista el inicio de sesión real (Fase 8), un 401 no mejora con el tiempo: no se sugiere esperar.
  // La Fase 8 sustituirá este texto y el reintento por «Volver a entrar».
  if (isApiError(error, 401)) return 'No hay una sesión activa para esta organización.'
  if (isApiError(error)) return 'El servidor no respondió como esperábamos. Vuelve a intentarlo en unos segundos.'
  return 'Revisa tu conexión y vuelve a intentarlo.'
}
