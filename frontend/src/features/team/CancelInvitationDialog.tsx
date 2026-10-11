import { Alert, Button, Modal, useToast } from '../../components/ui'
import type { TeamMember } from '../../domain/member'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { useRemoveMember } from './queries'
import styles from './TeamDialogs.module.css'

export interface CancelInvitationDialogProps {
  /** Invitación que se cancela; `null` cierra el diálogo. */
  member: TeamMember | null
  onClose: () => void
  /** Cierre tras cancelar con éxito; si falta, se usa `onClose`. */
  onCancelled?: () => void
}

/**
 * Confirmación que nombra el correo. Cancelar usa la misma API que retirar: la invitación pasa a «Retirados» y se
 * puede volver a invitar al mismo correo. «Invitación cancelada» solo aparece tras la respuesta real de la API.
 */
export function CancelInvitationDialog({ member, onClose, onCancelled }: CancelInvitationDialogProps) {
  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="¿Cancelar esta invitación?"
      description={
        member ? (
          <>
            <span className={styles.name}>{member.email}</span> ya no podrá entrar con esta invitación. Puedes volver a
            invitar al mismo correo cuando quieras.
          </>
        ) : undefined
      }
    >
      {member && <CancelForm key={member.id} member={member} onClose={onClose} onCancelled={onCancelled ?? onClose} />}
    </Modal>
  )
}

function CancelForm({
  member,
  onClose,
  onCancelled,
}: {
  member: TeamMember
  onClose: () => void
  onCancelled: () => void
}) {
  const cancel = useRemoveMember()
  const submission = useRepeatableSubmission()
  const toast = useToast()

  function confirm() {
    if (cancel.isPending) return
    submission.send(() =>
      cancel.mutate(member.id, {
        onSuccess: () => {
          toast.show({ title: 'Invitación cancelada', description: `${member.email} ya no puede entrar con ella.` })
          onCancelled()
        },
      }),
    )
  }

  const error = cancel.error
  return (
    <div className={styles.form}>
      <LockTimeoutAlert
        error={error}
        pending={cancel.isPending}
        onRetry={submission.retry}
        what="cancelar la invitación"
      />
      {error && !isLockTimeout(error) && (
        <Alert tone="red" title="No se pudo cancelar la invitación" live>
          {mutationErrorDetail(error)}
        </Alert>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Conservar invitación
        </Button>
        <Button variant="danger" loading={cancel.isPending} loadingLabel="Cancelando…" onClick={confirm}>
          Cancelar invitación
        </Button>
      </div>
    </div>
  )
}
