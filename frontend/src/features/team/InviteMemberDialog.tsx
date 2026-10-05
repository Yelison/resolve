import { useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, Input, Modal, Select, useToast } from '../../components/ui'
import { isApiError } from '../../api/client'
import { mutationErrorDetail } from '../../lib/mutationError'
import { teamRoles, type TeamRole } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import { useInviteMember } from './queries'
import styles from './TeamDialogs.module.css'

const MAX_NAME = 120
const MAX_EMAIL = 254
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldName = 'email' | 'name'
type Errors = Partial<Record<FieldName, string>>

export interface InviteMemberDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Diálogo para invitar a un agente o administrador. No se envía ningún correo (D-08): la persona entra con ese correo
 * y el aviso lo dice. «Invitación creada» solo aparece tras la respuesta real de la API.
 */
export function InviteMemberDialog({ open, onClose }: InviteMemberDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invitar agente"
      description="La persona entrará con este correo; todavía no enviamos correos de invitación."
    >
      <InviteForm onClose={onClose} />
    </Modal>
  )
}

function InviteForm({ onClose }: { onClose: () => void }) {
  const invite = useInviteMember()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<TeamRole>('agent')
  const [errors, setErrors] = useState<Errors>({})
  const [failed, setFailed] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Segunda barrera: el botón en carga ya bloquea el envío, también el que dispara Enter en un campo.
    if (invite.isPending) return
    const form = event.currentTarget
    const trimmed = { email: email.trim(), name: name.trim() }
    const found: Errors = {}
    if (!trimmed.email) found.email = 'Escribe el correo de la persona.'
    else if (!EMAIL_PATTERN.test(trimmed.email)) found.email = 'Escribe un correo válido, como nombre@empresa.com.'
    else if (trimmed.email.length > MAX_EMAIL) found.email = `Usa como máximo ${MAX_EMAIL} caracteres.`
    if (trimmed.name.length > MAX_NAME) found.name = `Usa como máximo ${MAX_NAME} caracteres.`
    // flushSync pinta los errores antes de mover el foco al primer campo inválido.
    flushSync(() => {
      setErrors(found)
      setFailed(null)
    })
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    try {
      await invite.mutateAsync({ email: trimmed.email, name: trimmed.name || undefined, role })
      toast.show({ title: 'Invitación creada', description: `${trimmed.email} podrá entrar con este correo.` })
      onClose()
    } catch (error) {
      const serverErrors: Errors = {}
      if (isApiError(error, 400)) {
        for (const field of ['email', 'name'] as const) {
          const message = error.fieldError(field)
          if (message) serverErrors[field] = message
        }
      }
      flushSync(() => {
        setErrors(serverErrors)
        setFailed(Object.keys(serverErrors).length === 0 ? mutationErrorDetail(error) : null)
      })
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate aria-busy={invite.isPending}>
      {failed && (
        <Alert tone="red" title="No se pudo crear la invitación" live>
          {failed}
        </Alert>
      )}
      <Input
        label="Correo"
        type="email"
        value={email}
        maxLength={MAX_EMAIL}
        autoComplete="off"
        onChange={(event) => {
          setEmail(event.target.value)
          setErrors((current) => ({ ...current, email: undefined }))
        }}
        error={errors.email}
      />
      <Input
        label="Nombre"
        hint="Opcional. Si lo dejas vacío usaremos la parte del correo antes de la @."
        value={name}
        maxLength={MAX_NAME}
        autoComplete="off"
        onChange={(event) => {
          setName(event.target.value)
          setErrors((current) => ({ ...current, name: undefined }))
        }}
        error={errors.name}
      />
      <Select label="Rol" value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>
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
        <Button type="submit" loading={invite.isPending} loadingLabel="Invitando…">
          Invitar
        </Button>
      </div>
    </form>
  )
}
