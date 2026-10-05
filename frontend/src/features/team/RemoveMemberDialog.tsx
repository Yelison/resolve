import { Alert, Button, Modal, useToast } from '../../components/ui'
import type { TeamMember } from '../../domain/member'
import { mutationErrorDetail } from '../../lib/mutationError'
import { useRemoveMember } from './queries'
import styles from './TeamDialogs.module.css'

export interface RemoveMemberDialogProps {
  /** Miembro que se retira; `null` cierra el diálogo. */
  member: TeamMember | null
  onClose: () => void
  /** Cierre tras retirar con éxito; si falta, se usa `onClose`. */
  onRemoved?: () => void
}

/** Confirmación que nombra a la persona. «Miembro retirado» solo aparece tras la respuesta real de la API. */
export function RemoveMemberDialog({ member, onClose, onRemoved }: RemoveMemberDialogProps) {
  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="¿Retirar a este miembro del equipo?"
      description={
        member ? (
          <>
            <span className={styles.name}>{member.name}</span> dejará de poder entrar y sus tickets sin resolver
            quedarán sin asignar. Su historial se conserva.
          </>
        ) : undefined
      }
    >
      {member && <RemoveForm key={member.id} member={member} onClose={onClose} onRemoved={onRemoved ?? onClose} />}
    </Modal>
  )
}

function RemoveForm({
  member,
  onClose,
  onRemoved,
}: {
  member: TeamMember
  onClose: () => void
  onRemoved: () => void
}) {
  const remove = useRemoveMember()
  const toast = useToast()

  function confirm() {
    if (remove.isPending) return
    remove.mutate(member.id, {
      onSuccess: () => {
        toast.show({ title: 'Miembro retirado', description: `${member.name} ya no forma parte del equipo.` })
        onRemoved()
      },
    })
  }

  const error = remove.error
  return (
    <div className={styles.form}>
      {error && (
        <Alert tone="red" title="No se pudo retirar al miembro" live>
          {mutationErrorDetail(error)}
        </Alert>
      )}
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="danger" loading={remove.isPending} loadingLabel="Retirando…" onClick={confirm}>
          Retirar del equipo
        </Button>
      </div>
    </div>
  )
}
