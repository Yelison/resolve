import { useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { Alert, Button, Input, Modal, useToast } from '../../components/ui'
import { isApiError } from '../../api/client'
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
          : 'Solo se envían los campos que cambies.'
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
      initial={{ name: '', email: '', company: '' }}
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
  // Lo que se editó se compara con los datos con los que se abrió el diálogo, no con la recarga posterior a un 412:
  // así un reintento no envía (ni pisa) los campos que cambió otra persona y que esta no tocó.
  const [initial] = useState<Values>(() => ({
    name: customer.name,
    email: customer.email,
    company: customer.company ?? '',
  }))
  return (
    <CustomerForm
      initial={initial}
      submitLabel="Guardar cambios"
      pendingLabel="Guardando…"
      pending={update.isPending}
      onCancel={onClose}
      save={async (values) => {
        const changes: CustomerPatch = {}
        if (values.name !== initial.name) changes.name = values.name
        if (values.email !== initial.email) changes.email = values.email
        if (values.company !== initial.company) changes.company = values.company || null
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
  initial: Values
  submitLabel: string
  pendingLabel: string
  pending: boolean
  onCancel: () => void
  /** Guarda los valores ya recortados; rechaza con el error de la API, que el formulario muestra. */
  save: (values: Values) => Promise<void>
}

function CustomerForm({ initial, submitLabel, pendingLabel, pending, onCancel, save }: CustomerFormProps) {
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [failure, setFailure] = useState<'conflict' | 'archived' | 'generic' | null>(null)

  function change(field: FieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
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
    // Enter en un campo envía aunque el botón esté cargando: no se duplica la petición.
    if (pending) return
    const form = event.currentTarget
    const trimmed: Values = { name: values.name.trim(), email: values.email.trim(), company: values.company.trim() }
    const found = validate(trimmed)
    // flushSync pinta los errores antes de mover el foco al primer campo inválido.
    flushSync(() => {
      setErrors(found)
      setFailure(null)
    })
    if (Object.keys(found).length > 0) {
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    try {
      await save(trimmed)
    } catch (error) {
      if (isApiError(error, 412)) {
        setFailure('conflict')
      } else if (isApiError(error, 409)) {
        setFailure('archived')
      } else if (isApiError(error, 400)) {
        const serverErrors: Errors = {}
        for (const field of fieldNames) {
          const message = error.fieldError(field)
          if (message) serverErrors[field] = message
        }
        flushSync(() => {
          setErrors(serverErrors)
          setFailure(Object.keys(serverErrors).length > 0 ? null : 'generic')
        })
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      } else {
        setFailure('generic')
      }
    }
  }

  return (
    <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
      {failure === 'conflict' && (
        <Alert tone="amber" title="El cliente cambió mientras lo editabas" live>
          Otra persona lo actualizó y ya cargamos la versión actual. Tus cambios siguen aquí: revisa y vuelve a guardar.
        </Alert>
      )}
      {failure === 'archived' && (
        <Alert tone="red" title="El cliente está archivado" live>
          Restáuralo para poder editarlo.
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
        error={errors.name}
      />
      <Input
        label="Correo"
        type="email"
        value={values.email}
        maxLength={MAX_EMAIL}
        autoComplete="off"
        onChange={(event) => change('email', event.target.value)}
        error={errors.email}
      />
      <Input
        label="Empresa"
        hint="Opcional."
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
        <Button type="submit" loading={pending} loadingLabel={pendingLabel}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
