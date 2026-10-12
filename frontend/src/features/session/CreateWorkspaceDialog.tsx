import { useMemo, useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import { isApiError } from '../../api/client'
import { Alert, Button, Input, Modal, Select } from '../../components/ui'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { timeZoneGroups } from '../settings/timeZones'
import { useMe } from './queries'
import { createFailure, useSessionActions } from './useSessionActions'
import { spacesCount } from './workspaces'
import styles from './CreateWorkspaceDialog.module.css'

const MAX_NAME = 120

type FieldName = 'name' | 'timeZone'
type Errors = Partial<Record<FieldName, string>>

/** La zona del navegador: lo más probable es que sea la del equipo. */
const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** «Ya creaste 3 espacios, el máximo por persona.»: el número es el del servidor, no uno fijo. */
const limitSentence = (limit: number | undefined) =>
  limit === undefined
    ? 'Ya creaste el máximo de espacios por persona.'
    : `Ya creaste ${spacesCount(limit)}, el máximo por persona.`

export interface CreateWorkspaceDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * «Crear espacio»: pide el nombre y la zona horaria (la del navegador por defecto), con los errores bajo su campo, también
 * los `400` del servidor. Si la persona ya creó el máximo —el servidor responde `409` `organization-limit`, o `Me` dice
 * que ya no puede crear con el diálogo abierto— pasa a su propio estado con «Ver tus espacios». Al crear, la sesión
 * entra en el espacio nuevo (`useSessionActions`) y el diálogo se cierra. Por debajo de 768 px es una hoja inferior.
 * El diálogo solo existe mientras está abierto: cada vez parte de cero.
 */
export function CreateWorkspaceDialog({ open, onClose }: CreateWorkspaceDialogProps) {
  return open ? <Dialog onClose={onClose} /> : null
}

function Dialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const creation = useMe().data?.organizationCreation
  // El `409` ya se vio aunque `Me` aún no lo sepa; con `Me` al día, `allowed` lo dice solo.
  const [hitLimit, setHitLimit] = useState(false)
  const atLimit = hitLimit || (creation !== undefined && !creation.allowed && creation.created >= creation.limit)
  const notAllowed = !atLimit && creation !== undefined && !creation.allowed

  if (atLimit || notAllowed) {
    return (
      <Modal
        open
        onClose={onClose}
        presentation="sheet-on-narrow"
        title="Crear espacio"
        description={atLimit ? limitSentence(creation?.limit) : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            {atLimit && (
              <Button
                onClick={() => {
                  onClose()
                  void navigate('/configuracion/espacios')
                }}
              >
                Ver tus espacios
              </Button>
            )}
          </>
        }
      >
        <Alert
          tone="blue"
          live
          title={
            atLimit
              ? 'Para crear otro, sal de uno que ya no uses o pide a otra persona que lo cree.'
              : 'Solo quien administra un espacio puede crear otros.'
          }
        />
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      presentation="sheet-on-narrow"
      title="Crear espacio"
      description="Tendrás tu propio equipo, clientes y base de conocimiento. Serás su administrador."
    >
      <CreateForm onClose={onClose} onLimit={() => setHitLimit(true)} />
    </Modal>
  )
}

function CreateForm({ onClose, onLimit }: { onClose: () => void; onLimit: () => void }) {
  const { createOrganization } = useSessionActions()
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
      onClose()
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
      flushSync(() => {
        setLockError(null)
        setErrors(serverErrors)
        setFailed(Object.keys(serverErrors).length === 0 ? mutationErrorDetail(error) : null)
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
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" loading={createOrganization.isPending} loadingLabel="Creando…">
          Crear espacio
        </Button>
      </div>
    </form>
  )
}
