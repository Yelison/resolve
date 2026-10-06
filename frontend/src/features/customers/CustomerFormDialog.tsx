import { useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, Input, Modal, useToast } from '../../components/ui'
import { isApiError } from '../../api/client'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { demoErrorMessage, isDemoMaintenance, isLockTimeout } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import type { CustomerDetail, CustomerPatch } from '../../domain/customer'
import { useCreateCustomer, useUpdateCustomer } from './queries'
import styles from './CustomerFormDialog.module.css'

const MAX_NAME = 120
const MAX_EMAIL = 254
const MAX_COMPANY = 120
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type FieldName = 'name' | 'email' | 'company'
type Values = Record<FieldName, string>
type Errors = Partial<Record<FieldName, string>>

const fieldNames: readonly FieldName[] = ['name', 'email', 'company']
const fieldLabels: Record<FieldName, string> = { name: 'Nombre', email: 'Correo', company: 'Empresa' }

export type CustomerFormDialogProps = { open: boolean; onClose: () => void } & (
  | { mode: 'create'; onSaved?: (customer: CustomerDetail) => void }
  | { mode: 'edit'; customer: CustomerDetail; onSaved?: (customer: CustomerDetail) => void }
)

/**
 * Diálogo de alta y edición de un cliente (mismo formulario, `mode`). Los mensajes de éxito solo aparecen tras la
 * respuesta real de la API.
 */
export function CustomerFormDialog(props: CustomerFormDialogProps) {
  const { open, onClose } = props
  const title = props.mode === 'create' ? 'Nuevo cliente' : 'Editar cliente'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        props.mode === 'create'
          ? 'Guarda sus datos de contacto para vincularlos a sus tickets.'
          : 'Actualiza sus datos de contacto.'
      }
    >
      {props.mode === 'create' ? (
        <CreateForm onClose={onClose} onSaved={props.onSaved} />
      ) : (
        <EditForm customer={props.customer} onClose={onClose} onSaved={props.onSaved} />
      )}
    </Modal>
  )
}

interface FormProps {
  onClose: () => void
  onSaved?: (customer: CustomerDetail) => void
}

function CreateForm({ onClose, onSaved }: FormProps) {
  const create = useCreateCustomer()
  const toast = useToast()
  return (
    <CustomerForm
      source={{ name: '', email: '', company: '' }}
      sourceVersion={0}
      archived={false}
      submitLabel="Crear cliente"
      pendingLabel="Creando…"
      pending={create.isPending}
      onCancel={onClose}
      save={async (values) => {
        const customer = await create.mutateAsync({
          name: values.name,
          email: values.email,
          company: values.company || null,
        })
        toast.show({ title: 'Cliente creado' })
        onClose()
        onSaved?.(customer)
      }}
    />
  )
}

function EditForm({ customer, onClose, onSaved }: FormProps & { customer: CustomerDetail }) {
  const update = useUpdateCustomer(customer.id)
  const toast = useToast()
  return (
    <CustomerForm
      source={{ name: customer.name, email: customer.email, company: customer.company ?? '' }}
      sourceVersion={customer.version}
      archived={customer.archived}
      submitLabel="Guardar cambios"
      pendingLabel="Guardando…"
      pending={update.isPending}
      onCancel={onClose}
      save={async (values, changed) => {
        // Solo viajan los campos que difieren de lo que hay ahora en el servidor. Los no tocados ya se rebasaron a ese
        // valor y no viajan: un reintento tras un 412 no pisa lo que cambió otra persona, y volver a escribir el valor
        // original de un campo que cambió otra persona sí lo envía.
        const changes: CustomerPatch = {}
        if (changed.includes('name')) changes.name = values.name
        if (changed.includes('email')) changes.email = values.email
        if (changed.includes('company')) changes.company = values.company || null
        if (Object.keys(changes).length === 0) {
          onClose()
          return
        }
        const saved = await update.mutateAsync({ version: customer.version, changes })
        toast.show({ title: 'Cambios guardados' })
        onClose()
        onSaved?.(saved)
      }}
    />
  )
}

interface CustomerFormProps {
  /** Valores actuales del servidor (vacíos en el alta). Si llega una versión nueva se rebasan los campos no tocados. */
  source: Values
  sourceVersion: number
  /** Un cliente archivado no se puede editar: se avisa y no se deja guardar. */
  archived: boolean
  submitLabel: string
  pendingLabel: string
  pending: boolean
  onCancel: () => void
  /**
   * Guarda los valores ya recortados y la lista de campos tocados que difieren del servidor; rechaza con el error de la
   * API, que el formulario muestra.
   */
  save: (values: Values, changed: FieldName[]) => Promise<void>
}

function CustomerForm({
  source,
  sourceVersion,
  archived,
  submitLabel,
  pendingLabel,
  pending,
  onCancel,
  save,
}: CustomerFormProps) {
  const [values, setValues] = useState<Values>(source)
  // Valores del servidor con los que se empezó a editar cada campo: un campo está «tocado» si difiere de su base.
  const [base, setBase] = useState<Values>(source)
  const [seenVersion, setSeenVersion] = useState(sourceVersion)
  /** Campos que otra persona cambió en la última versión que llegó; se nombran en el aviso de conflicto. */
  const [serverChanged, setServerChanged] = useState<FieldName[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<'conflict' | 'archived' | 'generic' | null>(null)
  /** Rechazo propio de la demostración pública (reinicio, demasiadas escrituras, tope): su texto va tal cual. */
  const [demoFailure, setDemoFailure] = useState<string | null>(null)
  /** El 503 de bloqueo del último envío (nada se cambió); su aviso ofrece repetir ese mismo envío. */
  const [lockError, setLockError] = useState<unknown>(null)
  const submission = useRepeatableSubmission()

  // Llegó una versión más nueva del cliente (p. ej. tras un 412): los campos no tocados pasan a los valores del
  // servidor y los tocados conservan lo escrito.
  if (sourceVersion > seenVersion) {
    setSeenVersion(sourceVersion)
    setServerChanged(fieldNames.filter((field) => source[field] !== base[field]))
    const untouched = fieldNames.filter((field) => values[field] === base[field])
    setValues({ ...values, ...Object.fromEntries(untouched.map((field) => [field, source[field]])) })
    setBase({ ...base, ...Object.fromEntries(untouched.map((field) => [field, source[field]])) })
  }

  const touched = (field: FieldName) => values[field] !== base[field]
  /** «Ahora: …» junto a un campo tocado cuyo valor en el servidor cambió desde que se empezó a editar. */
  const serverNote = (field: FieldName) =>
    touched(field) && source[field] !== base[field] && values[field].trim() !== source[field]
      ? `Ahora: ${source[field] || 'vacío'}`
      : undefined

  function change(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    // El reintento repetiría lo enviado, no lo que se ve ahora: editar retira el aviso de bloqueo.
    setLockError(null)
  }

  function validate(trimmed: Values): Errors {
    const found: Errors = {}
    if (!trimmed.name) found.name = 'Escribe el nombre del cliente.'
    else if (trimmed.name.length > MAX_NAME) found.name = `Usa como máximo ${MAX_NAME} caracteres.`
    if (!trimmed.email) found.email = 'Escribe el correo del cliente.'
    else if (!EMAIL_PATTERN.test(trimmed.email)) found.email = 'Escribe un correo válido, como nombre@empresa.com.'
    else if (trimmed.email.length > MAX_EMAIL) found.email = `Usa como máximo ${MAX_EMAIL} caracteres.`
    if (trimmed.company.length > MAX_COMPANY) found.company = `Usa como máximo ${MAX_COMPANY} caracteres.`
    return found
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Segunda barrera: el botón en carga ya bloquea el envío, también el que dispara Enter en un campo.
    if (pending || archived) return
    const form = event.currentTarget
    const trimmed: Values = { name: values.name.trim(), email: values.email.trim(), company: values.company.trim() }
    const found = validate(trimmed)
    // flushSync pinta los errores antes de mover el foco al primer campo inválido.
    flushSync(() => {
      setErrors(found)
      setFailure(null)
      setDemoFailure(null)
    })
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    // El envío ya compuesto (valores y campos tocados): el reintento de un 503 lo repite tal cual, con su versión.
    const changed = fieldNames.filter((field) => trimmed[field] !== source[field].trim())
    setLockError(null)
    submission.send(() => void attempt(form, trimmed, changed))
  }

  async function attempt(form: HTMLFormElement, trimmed: Values, changed: FieldName[]) {
    try {
      await save(trimmed, changed)
    } catch (error) {
      const demo = demoErrorMessage(error)
      if (demo) {
        setLockError(null)
        setFailure(null)
        // El texto del reinicio lo da el aviso global del shell: aquí solo lo local, para no anunciarlo dos veces.
        setDemoFailure(isDemoMaintenance(error) ? '' : demo)
      } else if (isLockTimeout(error)) {
        setFailure(null)
        setLockError(error)
      } else if (isApiError(error, 412)) {
        setLockError(null)
        setFailure('conflict')
      } else if (isApiError(error, 409)) {
        // El archivado llega como 409 si la versión coincidía; la recarga del detalle lo reflejará en `archived`.
        setLockError(null)
        setFailure('archived')
      } else if (isApiError(error, 400)) {
        const serverErrors: Errors = {}
        for (const field of fieldNames) {
          const message = error.fieldError(field)
          if (message) serverErrors[field] = message
        }
        flushSync(() => {
          setLockError(null)
          setErrors(serverErrors)
          setFailure(Object.keys(serverErrors).length > 0 ? null : 'generic')
        })
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      } else {
        setLockError(null)
        setFailure('generic')
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      {archived ? (
        <Alert tone="red" title="El cliente está archivado" live>
          Ya no se puede editar. Solo un administrador puede restaurarlo.
        </Alert>
      ) : null}
      {!archived && failure === 'conflict' && (
        <Alert tone="amber" title="El cliente cambió mientras lo editabas" live>
          Otra persona lo actualizó y ya cargamos la versión actual.
          {serverChanged.length > 0 && ` Cambió: ${serverChanged.map((field) => fieldLabels[field]).join(', ')}.`} Tus
          cambios siguen aquí: revisa y vuelve a guardar.
        </Alert>
      )}
      {!archived && failure === 'archived' && (
        <Alert tone="red" title="El cliente está archivado" live>
          Ya no se puede editar. Solo un administrador puede restaurarlo.
        </Alert>
      )}
      <LockTimeoutAlert error={lockError} pending={pending} onRetry={submission.retry} what="guardar el cliente" />
      {demoFailure === '' && (
        <Alert tone="amber" title="No se pudo guardar el cliente; lo que escribiste sigue aquí." live />
      )}
      {demoFailure && (
        <Alert tone="amber" title="No se pudo guardar el cliente" live>
          {demoFailure}
        </Alert>
      )}
      {failure === 'generic' && (
        <Alert tone="red" title="No se pudo guardar el cliente" live>
          Revisa tu conexión e inténtalo de nuevo.
        </Alert>
      )}
      <Input
        label="Nombre"
        value={values.name}
        maxLength={MAX_NAME}
        autoComplete="off"
        onChange={(event) => change('name', event.target.value)}
        hint={serverNote('name')}
        error={errors.name}
      />
      <Input
        label="Correo"
        type="email"
        value={values.email}
        maxLength={MAX_EMAIL}
        autoComplete="off"
        onChange={(event) => change('email', event.target.value)}
        hint={serverNote('email')}
        error={errors.email}
      />
      <Input
        label="Empresa"
        hint={serverNote('company') ?? 'Opcional.'}
        value={values.company}
        maxLength={MAX_COMPANY}
        autoComplete="off"
        onChange={(event) => change('company', event.target.value)}
        error={errors.company}
      />
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" disabled={archived} loading={pending} loadingLabel={pendingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
