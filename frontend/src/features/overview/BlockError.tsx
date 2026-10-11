import { isApiError } from '../../api/client'
import { Button, EmptyState } from '../../components/ui'

/**
 * El estado de error de un bloque de Inicio. Un 403 (el rol ya no permite ver ese bloque) no se reintenta: dice que no
 * hay permiso. El resto ofrece «Reintentar», con un nombre que distingue la acción de las de los demás bloques.
 */
export function BlockError({
  error,
  failureCount,
  title,
  restrictedTitle,
  retryLabel,
  onRetry,
  headingLevel = 3,
}: {
  error: unknown
  failureCount: number
  title: string
  restrictedTitle: string
  retryLabel: string
  onRetry: () => void
  headingLevel?: 2 | 3
}) {
  if (isApiError(error, 403)) {
    return (
      <EmptyState
        kind="restricted"
        headingLevel={headingLevel}
        title={restrictedTitle}
        description="Tu rol no permite ver esta información."
      />
    )
  }
  return (
    <EmptyState
      kind="error"
      headingLevel={headingLevel}
      title={title}
      description="Revisa tu conexión y vuelve a intentarlo."
      live={failureCount > 1}
      action={
        <Button variant="secondary" aria-label={retryLabel} onClick={onRetry}>
          Reintentar
        </Button>
      }
    />
  )
}
