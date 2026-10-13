import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { isApiError } from '../../api/client'
import { Alert, Button, Input, Select } from '../../components/ui'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { timeZoneGroups } from '../settings/timeZones'
import { createFailure, lostSession, useSessionActions } from './useSessionActions'
import styles from './CreateWorkspaceForm.module.css'

const MAX_NAME = 120

type FieldName = 'name' | 'timeZone'
type Errors = Partial<Record<FieldName, string>>

/** La zona del navegador: lo más probable es que sea la del equipo. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export interface CreateWorkspaceFormProps {
  /** Se llama cuando el espacio ya se creó y la sesión entró en él. */
  onCreated: () => void
  /** Se llama cuando el servidor responde que la persona ya creó el máximo de espacios. */
  onLimit: () => void
  /** Sin él no hay «Cancelar»: la pantalla que lo aloja no tiene a dónde volver. */
  onCancel?: () => void
}

/**
 * El formulario de «Crear espacio»: nombre y zona horaria (la del navegador por defecto), la validación del cliente y los
 * errores del servidor bajo su campo. Lo comparten el diálogo de quien ya tiene espacio y la pantalla de quien llega sin
 * ninguno (`CreateYourWorkspaceCard`): crear es una sola acción y no se escribe dos veces.
 */
export function CreateWorkspaceForm({ onCreated, onLimit, onCancel }: CreateWorkspaceFormProps) {
  const { createOrganization } = useSessionActions()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [timeZone, setTimeZone] = useState(browserTimeZone)
  const [errors, setErrors] = useState<Errors>({})
  const [failed, setFailed] = useState<string | null>(null)
  /** El 503 de bloqueo del último envío (nada se creó); su aviso ofrece repetir ese mismo envío. */
  const [lockError, setLockError] = useState<unknown>(null)
  const submission = useRepeatableSubmission()
  const groups = useMemo(() => timeZoneGroups(timeZone), [timeZone])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Segunda barrera: el botón en carga ya bloquea el clic, pero no el envío con Enter.
    if (createOrganization.isPending) return
    const form = event.currentTarget
    const trimmed = name.trim()
    const found: Errors = {}
    if (!trimmed) found.name = 'Escribe un nombre para el espacio.'
    else if (trimmed.length > MAX_NAME) found.name = `Usa como máximo ${MAX_NAME} caracteres.`
    // flushSync pinta los errores antes de mover el foco al primer campo inválido.
    flushSync(() => {
      setErrors(found)
      setFailed(null)
    })
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    // El reintento de un 503 repite este envío (nombre y zona ya compuestos), no lo que haya en el formulario.
    setLockError(null)
    submission.send(() => void attempt(form, { name: trimmed, timeZone }))
  }

  async function attempt(form: HTMLFormElement, body: { name: string; timeZone: string }) {
    try {
      await createOrganization.mutateAsync(body)
      onCreated()
    } catch (error) {
      if (isLockTimeout(error)) {
        flushSync(() => {
          setErrors({})
          setFailed(null)
          setLockError(error)
        })
        return
      }
      if (createFailure(error) === 'limit') {
        onLimit()
        return
      }
      const serverErrors: Errors = {}
      if (isApiError(error, 400)) {
        for (const field of ['name', 'timeZone'] as const) {
          const message = error.fieldError(field)
          if (message) serverErrors[field] = message
        }
      }
      // Un `401` sin sesión cargada no es un fallo del envío: la relectura de `/me` cambia la pantalla y, mientras llega,
      // «Revisa tu conexión» sería falso y se anunciaría.
      const showFailure = Object.keys(serverErrors).length === 0 && !lostSession(queryClient, error)
      flushSync(() => {
        setLockError(null)
        setErrors(serverErrors)
        setFailed(showFailure ? mutationErrorDetail(error) : null)
      })
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => void submit(event)}
      noValidate
      aria-busy={createOrganization.isPending}
    >
      <LockTimeoutAlert
        error={lockError}
        pending={createOrganization.isPending}
        onRetry={submission.retry}
        what="crear el espacio"
      />
      {failed && (
        <Alert tone="red" title="No pudimos crear el espacio" live>
          {failed}
        </Alert>
      )}
      <Input
        label="Nombre del espacio"
        name="name"
        value={name}
        maxLength={MAX_NAME}
        autoComplete="organization"
        hint="Lo verán tu equipo y tus clientes. Puedes cambiarlo después."
        onChange={(event) => {
          setName(event.target.value)
          setLockError(null)
          setErrors((current) => ({ ...current, name: undefined }))
        }}
        error={errors.name}
      />
      <Select
        label="Zona horaria"
        name="timeZone"
        value={timeZone}
        hint="Para los horarios y los reportes."
        onChange={(event) => {
          setTimeZone(event.target.value)
          setLockError(null)
          setErrors((current) => ({ ...current, timeZone: undefined }))
        }}
        error={errors.timeZone}
      >
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <div className={styles.actions}>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" block={!onCancel} loading={createOrganization.isPending} loadingLabel="Creando…">
          Crear espacio
        </Button>
      </div>
    </form>
  )
}
