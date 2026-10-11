import { isApiError } from '../../api/client'
import { useToast } from '../../components/ui'
import type { Ticket } from '../../domain/ticket'
import { demoErrorMessage, isLockTimeout } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { useUpdateTicket, type TicketChanges } from './queries'

/**
 * Cambios de estado, prioridad o responsable de un ticket con su `If-Match`, y los avisos que los acompañan. Los
 * comparten el detalle y la vista previa de la bandeja: mismas mutaciones, mismos errores.
 */
export function useTicketChange(ticket: Pick<Ticket, 'number' | 'version'>) {
  const toast = useToast()
  const update = useUpdateTicket(ticket.number)
  const submission = useRepeatableSubmission()
  const conflict = Boolean(update.error && isApiError(update.error, 412))

  function change(changes: TicketChanges, success: string) {
    // Mientras se guarda, los campos no se desactivan (el navegador sacaría de ellos el foco): ignoran el cambio.
    if (update.isPending) return
    // El reintento de un 503 repite esta llamada con su versión: si otra persona guardó entretanto, responde el 412.
    const variables = { version: ticket.version, changes }
    submission.send(() =>
      update.mutate(variables, {
        onSuccess: () => toast.show({ title: success }),
        onError: (error) => {
          // Un 412 lo explica el aviso de conflicto, un 503 de bloqueo el suyo con «Reintentar» y un 401, el aviso global
          // «Tu sesión caducó»: otro toast sería ruido.
          if (!isApiError(error, 412) && !isApiError(error, 401) && !isLockTimeout(error)) {
            toast.show({
              tone: 'error',
              title: 'No se pudo guardar el cambio',
              description: demoErrorMessage(error) ?? 'Inténtalo de nuevo.',
            })
          }
        },
      }),
    )
  }

  return { change, update, submission, conflict }
}
