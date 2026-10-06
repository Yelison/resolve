import { useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Avatar, Button, Input, useToast } from '../../components/ui'
import { isApiError } from '../../api/client'
import type { Me } from '../../api/schema'
import { roleLabels } from '../../app/navigation'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { focusSectionHeading } from './focus'
import { useUpdateProfile } from './queries'
import styles from './forms.module.css'

const MAX_NAME = 120

const STAFF_NAME_HINT =
  'Se actualiza en todo el espacio. El historial de actividad conserva el nombre que tenías en cada momento.'
const CUSTOMER_NAME_HINT = 'Así te mostramos en tu cuenta.'

/** Perfil de quien tiene la sesión: solo el nombre se puede cambiar; el correo se muestra sin control. */
export function ProfileForm({ me }: { me: Me }) {
  const update = useUpdateProfile()
  const toast = useToast()
  const [value, setValue] = useState(me.user.name)
  const [error, setError] = useState<string>()
  const [failure, setFailure] = useState<string | null>(null)
  /** El 503 de bloqueo del último envío (nada se cambió); su aviso ofrece repetir ese mismo envío. */
  const [lockError, setLockError] = useState<unknown>(null)
  const submission = useRepeatableSubmission()
  // Si el nombre cambia desde fuera (otra pestaña, relectura de la sesión) y no hay edición en curso, se sigue al servidor.
  const [seenName, setSeenName] = useState(me.user.name)
  if (me.user.name !== seenName) {
    if (value === seenName) setValue(me.user.name)
    setSeenName(me.user.name)
  }

  const trimmed = value.trim()
  const dirty = trimmed !== me.user.name

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (update.isPending || !dirty) return
    const form = event.currentTarget
    let found: string | undefined
    if (!trimmed) found = 'Escribe tu nombre.'
    else if (trimmed.length > MAX_NAME) found = `Usa como máximo ${MAX_NAME} caracteres.`
    flushSync(() => {
      setError(found)
      setFailure(null)
    })
    if (found) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    // El reintento de un 503 repite este envío con el nombre ya recortado, no lo que haya en el campo entonces.
    setLockError(null)
    submission.send(() => void attempt(form, trimmed))
  }

  async function attempt(form: HTMLFormElement, name: string) {
    try {
      const saved = await update.mutateAsync(name)
      setLockError(null)
      setValue(saved.user.name)
      setSeenName(saved.user.name)
      toast.show({ title: 'Cambios guardados' })
      focusSectionHeading(form)
    } catch (caught) {
      if (isLockTimeout(caught)) {
        setFailure(null)
        setLockError(caught)
      } else if (isApiError(caught, 400)) {
        const message = caught.fieldError('name')
        flushSync(() => {
          setLockError(null)
          setError(message)
          setFailure(message ? null : mutationErrorDetail(caught))
        })
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      } else {
        setLockError(null)
        setFailure(mutationErrorDetail(caught))
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate aria-busy={update.isPending}>
      <div className={styles.identity}>
        <Avatar name={me.user.name} decorative />
        <div className={styles.identityText}>
          <span className={styles.identityName}>{me.user.name}</span>
          <span className={styles.identityRole}>{roleLabels[me.role]}</span>
        </div>
      </div>
      <LockTimeoutAlert
        error={lockError}
        pending={update.isPending}
        onRetry={submission.retry}
        what="guardar tu nombre"
      />
      {failure && (
        <Alert tone="red" title="No se pudo guardar tu nombre" live>
          {failure}
        </Alert>
      )}
      <Input
        label="Nombre"
        value={value}
        maxLength={MAX_NAME}
        autoComplete="name"
        onChange={(event) => {
          setValue(event.target.value)
          setError(undefined)
          // El reintento repetiría lo enviado, no lo que se ve ahora: editar retira el aviso de bloqueo.
          setLockError(null)
        }}
        hint={me.role === 'customer' ? CUSTOMER_NAME_HINT : STAFF_NAME_HINT}
        error={error}
      />
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Correo</dt>
          <dd>{me.user.email}</dd>
        </div>
      </dl>
      <div className={styles.actions}>
        <Button type="submit" disabled={!dirty} loading={update.isPending} loadingLabel="Guardando…">
          Guardar cambios
        </Button>
      </div>
    </form>
  )
}
