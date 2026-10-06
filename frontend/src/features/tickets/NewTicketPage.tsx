import { useState, type FormEvent } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import {
  Alert,
  Button,
  Combobox,
  Input,
  Select,
  Textarea,
  ticketPriority,
  useToast,
  type ComboboxOption,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import type { TicketPriority } from '../../domain/ticket'
import { ticketPriorityValues } from '../../domain/ticket'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { demoErrorMessage, isDemoMaintenance, isLockTimeout } from '../../lib/mutationError'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useCustomerSearch } from '../customers/queries'
import { useAssignees } from '../team/queries'
import { useCreateTicket } from './queries'
import styles from './NewTicketPage.module.css'

const MAX_SUBJECT = 160
const MAX_DESCRIPTION = 5000

type FieldName = 'customerId' | 'subject' | 'description' | 'priority' | 'assigneeId'
type Errors = Partial<Record<FieldName, string>>

export function NewTicketPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const createTicket = useCreateTicket()
  const submission = useRepeatableSubmission()
  const assignees = useAssignees()

  const [customerQuery, setCustomerQuery] = useState('')
  const customers = useCustomerSearch(useDebouncedValue(customerQuery, 250))
  const [customer, setCustomer] = useState<ComboboxOption | null>(null)
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  function validate(): Errors {
    const found: Errors = {}
    if (!customer) found.customerId = 'Selecciona un cliente.'
    if (!subject.trim()) found.subject = 'Describe el problema en una frase.'
    else if (subject.trim().length > MAX_SUBJECT) found.subject = `Usa como máximo ${MAX_SUBJECT} caracteres.`
    if (!description.trim()) found.description = 'Cuéntanos qué ocurrió.'
    else if (description.trim().length > MAX_DESCRIPTION) {
      found.description = `Usa como máximo ${MAX_DESCRIPTION} caracteres.`
    }
    return found
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const found = validate()
    // flushSync pinta los errores antes de mover el foco al primer campo inválido.
    flushSync(() => setErrors(found))
    if (Object.keys(found).length > 0 || !customer) {
      // El foco va al primer campo con error para que el teclado y los lectores lleguen a él.
      event.currentTarget.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    const ticket = {
      customerId: customer.value,
      subject: subject.trim(),
      description: description.trim(),
      priority,
      assigneeId: assigneeId || null,
    }
    // El reintento de un 503 repite esta misma llamada, no la compone de nuevo con lo que haya en el formulario.
    submission.send(() =>
      createTicket.mutate(ticket, {
        onSuccess: (ticket) => {
          toast.show({ title: `Ticket #${ticket.number} creado` })
          void navigate(`/tickets/${ticket.number}`)
        },
        onError: (error) => {
          if (isApiError(error, 400)) {
            const serverErrors: Errors = {}
            for (const field of ['customerId', 'subject', 'description', 'priority', 'assigneeId'] as const) {
              const message = error.fieldError(field)
              if (message) serverErrors[field] = message
            }
            setErrors(serverErrors)
          } else if (!isLockTimeout(error) && demoErrorMessage(error) === undefined) {
            toast.show({ tone: 'error', title: 'No se pudo crear el ticket', description: 'Inténtalo de nuevo.' })
          }
        },
      }),
    )
  }

  /** Editar el formulario retira el aviso de bloqueo: el reintento repetiría lo enviado, no lo que se ve ahora. */
  function dismissLockTimeout() {
    if (isLockTimeout(createTicket.error)) createTicket.reset()
  }

  const customerOptions: ComboboxOption[] = (customers.data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.name,
    description: [item.company, item.email].filter(Boolean).join(' · '),
  }))

  return (
    <div className={pageStyles.page}>
      <PageHeader title="Crear ticket" description="Registra una solicitud y asigna el siguiente paso." />
      <form className={styles.form} onSubmit={submit} onChange={dismissLockTimeout} noValidate>
        <section className={styles.panel} aria-labelledby="new-ticket-details">
          <h2 id="new-ticket-details" className={styles.panelTitle}>
            Detalles de la solicitud
          </h2>
          <Combobox
            label="Cliente"
            placeholder="Busca por nombre, correo o empresa"
            query={customerQuery}
            onQueryChange={setCustomerQuery}
            options={customerOptions}
            selected={customer}
            onSelect={(option) => {
              setCustomer(option)
              dismissLockTimeout()
              setErrors((current) => ({ ...current, customerId: undefined }))
            }}
            loading={customers.isFetching}
            emptyText="Ningún cliente coincide con la búsqueda"
            error={errors.customerId}
          />
          <Input
            label="Asunto"
            placeholder="Describe el problema en una frase"
            value={subject}
            maxLength={MAX_SUBJECT}
            onChange={(event) => setSubject(event.target.value)}
            error={errors.subject}
          />
          <Textarea
            label="Descripción"
            placeholder="Cuéntanos qué ocurrió y cómo podemos reproducirlo."
            rows={6}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={errors.description}
          />
          <LockTimeoutAlert
            error={createTicket.error}
            pending={createTicket.isPending}
            onRetry={submission.retry}
            what="crear el ticket"
          />
          {isDemoMaintenance(createTicket.error) ? (
            // El texto del reinicio lo da el aviso global del shell: aquí solo lo local, para no anunciarlo dos veces.
            <Alert tone="amber" title="No se pudo crear el ticket; lo que escribiste sigue aquí." live />
          ) : (
            demoErrorMessage(createTicket.error) && (
              <Alert tone="amber" title="No se pudo crear el ticket" live>
                {demoErrorMessage(createTicket.error)}
              </Alert>
            )
          )}
          <div className={styles.actions}>
            <Button type="submit" loading={createTicket.isPending} loadingLabel="Creando…">
              Crear ticket
            </Button>
            <Button variant="secondary" onClick={() => void navigate('/tickets')}>
              Cancelar
            </Button>
          </div>
        </section>

        <aside className={styles.panel} aria-labelledby="new-ticket-organize">
          <h2 id="new-ticket-organize" className={styles.panelTitle}>
            Organiza el trabajo
          </h2>
          <Select
            label="Prioridad"
            value={priority}
            onChange={(event) => setPriority(event.target.value as TicketPriority)}
            error={errors.priority}
          >
            {ticketPriorityValues.map((value) => (
              <option key={value} value={value}>
                {ticketPriority[value].label}
              </option>
            ))}
          </Select>
          <Select
            label="Responsable"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            disabled={assignees.isPending}
            error={errors.assigneeId}
          >
            <option value="">Sin asignar</option>
            {assignees.data?.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </Select>
          <p className={styles.note}>Puedes ajustar estos datos después.</p>
        </aside>
      </form>
    </div>
  )
}
