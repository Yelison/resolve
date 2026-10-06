import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { useState } from 'react'
import { Alert, Button, Modal, Select, useToast } from '../../components/ui'
import { teamRoles, type TeamMember, type TeamRole } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import { useChangeRole } from './queries'
import styles from './TeamDialogs.module.css'

export interface ChangeRoleDialogProps {
  /** Miembro cuyo rol se cambia; `null` cierra el diálogo. */
  member: TeamMember | null
  onClose: () => void
}

/** Cambia el rol de un administrador o agente. El servidor decide si se puede (p. ej. el último administrador). */
export function ChangeRoleDialog({ member, onClose }: ChangeRoleDialogProps) {
  return (
    <Modal
      open={member !== null}
      onClose={onClose}
      title="Cambiar rol"
      description={
        member ? (
          <>
            Elige el rol de <span className={styles.name}>{member.name}</span>.
          </>
        ) : undefined
      }
    >
      {member && <RoleForm key={member.id} member={member} onClose={onClose} />}
    </Modal>
  )
}

function RoleForm({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const change = useChangeRole()
  const submission = useRepeatableSubmission()
  const toast = useToast()
  const [role, setRole] = useState<TeamRole>(member.role === 'admin' ? 'admin' : 'agent')
  const unchanged = role === member.role

  function submit() {
    if (change.isPending || unchanged) return
    const variables = { userId: member.id, role }
    submission.send(() =>
      change.mutate(variables, {
        onSuccess: () => {
          toast.show({
            title: 'Rol actualizado',
            description: `${member.name} ahora tiene el rol de ${roleLabels[role].toLowerCase()}.`,
          })
          onClose()
        },
      }),
    )
  }

  const error = change.error
  return (
    <form
      className={styles.form}
      aria-busy={change.isPending}
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <LockTimeoutAlert error={error} pending={change.isPending} onRetry={submission.retry} what="cambiar el rol" />
      {error && !isLockTimeout(error) && (
        <Alert tone="red" title="No se pudo cambiar el rol" live>
          {mutationErrorDetail(error)}
        </Alert>
      )}
      <Select
        label="Rol"
        value={role}
        onChange={(event) => {
          setRole(event.target.value as TeamRole)
          if (change.isError) change.reset()
        }}
      >
        {teamRoles.map((value) => (
          <option key={value} value={value}>
            {roleLabels[value]}
          </option>
        ))}
      </Select>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={unchanged} loading={change.isPending} loadingLabel="Guardando…">
          Guardar rol
        </Button>
      </div>
    </form>
  )
}
