import { useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  buttonClassName,
  EmptyState,
  Modal,
  Skeleton,
  Tabs,
  Textarea,
  useToast,
  type BadgeTone,
} from '../../components/ui'
import { isApiError } from '../../api/client'
import type { CustomerDetail } from '../../domain/customer'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import { LockTimeoutAlert } from '../../lib/LockTimeoutAlert'
import { demoErrorMessage, isLockTimeout, mutationErrorDetail } from '../../lib/mutationError'
import { useRepeatableSubmission } from '../../lib/useRepeatableSubmission'
import { useMe } from '../session/queries'
import { useTimeZone } from '../session/useTimeZone'
import { customerSince } from './customerSince'
import { ticketContext } from './ticketContext'
import { CustomerFormDialog } from './CustomerFormDialog'
import { CustomerTickets } from './CustomerTickets'
import { useArchiveCustomer, useCustomer, useInviteCustomer, useRestoreCustomer, useUpdateCustomer } from './queries'
import styles from './CustomerDetailPage.module.css'

const MAX_NOTES = 2000

const portalAccessLabels: Record<CustomerDetail['portalAccess'], { label: string; tone: BadgeTone }> = {
  none: { label: 'Sin acceso', tone: 'neutral' },
  invited: { label: 'Invitación pendiente', tone: 'amber' },
  active: { label: 'Acceso activo', tone: 'green' },
}

/** Detalle del cliente. La guardia de rol la pone la ruta (`sectionRoute`). */
export function CustomerDetailPage() {
  const id = useParams().id ?? ''
  const customer = useCustomer(id)
  const me = useMe()

  // Sin conocer el rol no se pinta nada: evita mostrar un instante acciones de administración a un agente.
  if (customer.isPending || me.isPending) {
    return (
      <div className={pageStyles.page}>
        <Skeleton lines={2} label="Cargando cliente…" />
        <Skeleton lines={4} label="" />
      </div>
    )
  }
  if (customer.isError) {
    const missing = isApiError(customer.error, 404) || isApiError(customer.error, 400)
    return (
      <div className={pageStyles.page}>
        <PageHeader title={missing ? 'Cliente no encontrado' : 'No pudimos cargar el cliente'} />
        <EmptyState
          kind={missing ? 'noResults' : 'error'}
          title={missing ? 'No existe el cliente' : 'Revisa tu conexión'}
          description={missing ? 'Puede que el enlace sea incorrecto o que no tengas acceso.' : 'Vuelve a intentarlo.'}
          action={
            missing ? (
              <Link to="/clientes" className={buttonClassName({ variant: 'secondary' })}>
                Volver a clientes
              </Link>
            ) : (
              <Button variant="secondary" onClick={() => void customer.refetch()}>
                Reintentar
              </Button>
            )
          }
        />
      </div>
    )
  }
  // La clave reinicia el borrador de notas y los diálogos al pasar de un cliente a otro.
  return <CustomerDetail key={customer.data.id} customer={customer.data} isAdmin={me.data?.role === 'admin'} />
}

function CustomerDetail({ customer, isAdmin }: { customer: CustomerDetail; isAdmin: boolean }) {
  const timeZone = useTimeZone()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [invitingToPortal, setInvitingToPortal] = useState(false)
  // El borrador de notas vive aquí: la pestaña desmonta su contenido al cambiar y no debe perder lo escrito.
  const [notesDraft, setNotesDraft] = useState<string | null>(null)
  const archive = useArchiveCustomer(customer.id)
  const restore = useRestoreCustomer(customer.id)
  const invite = useInviteCustomer(customer.id)
  // Un envío recordado por acción: el reintento de un 503 de bloqueo repite esa llamada tal cual.
  const inviteSubmission = useRepeatableSubmission()
  const restoreSubmission = useRepeatableSubmission()
  const archiveSubmission = useRepeatableSubmission()
  const access = portalAccessLabels[customer.portalAccess]
  // Un cliente archivado tiene el acceso suspendido, diga lo que diga `portalAccess` (ver el contrato).
  const portal = customer.archived ? { label: 'Acceso suspendido', tone: 'neutral' as BadgeTone } : access
  const subtitle = ['Cliente', customer.company, `cliente desde ${customerSince(customer.createdAt, timeZone)}`]
    .filter(Boolean)
    .join(' · ')

  // Si el disparador ya no existe al cerrar (un 403 ocultó las acciones), el foco no se pierde en el body.
  function closePortalInvite() {
    setInvitingToPortal(false)
    invite.reset()
    focusPageHeadingIfFocusLost()
  }

  function closeEdit() {
    setEditing(false)
    focusPageHeadingIfFocusLost()
  }

  function closeArchive() {
    setConfirmingArchive(false)
    focusPageHeadingIfFocusLost()
  }

  function inviteToPortal() {
    if (invite.isPending) return
    inviteSubmission.send(() =>
      invite.mutate(undefined, {
        onSuccess: () => {
          closePortalInvite()
          toast.show({ title: 'Invitación creada', description: `${customer.email} podrá entrar al portal.` })
        },
      }),
    )
  }

  function restoreCustomer() {
    restoreSubmission.send(() =>
      restore.mutate(undefined, {
        onSuccess: () => toast.show({ title: 'Cliente restaurado' }),
        onError: (error) => {
          // Un 503 de bloqueo lo explica su aviso con «Reintentar».
          if (isLockTimeout(error)) return
          toast.show({
            tone: 'error',
            title: isApiError(error, 409) ? 'El cliente ya estaba activo' : 'No se pudo restaurar el cliente',
            description: isApiError(error, 409) ? undefined : (demoErrorMessage(error) ?? 'Inténtalo de nuevo.'),
          })
        },
      }),
    )
  }

  function archiveCustomer() {
    archiveSubmission.send(() =>
      archive.mutate(undefined, {
        onSuccess: () => {
          closeArchive()
          toast.show({ title: 'Cliente archivado' })
        },
        onError: (error) => {
          if (isApiError(error, 409)) setConfirmingArchive(false)
          // Un 503 de bloqueo lo explica el aviso con «Reintentar» dentro del diálogo, que sigue abierto.
          if (isLockTimeout(error)) return
          toast.show({
            tone: 'error',
            title: isApiError(error, 409) ? 'El cliente ya estaba archivado' : 'No se pudo archivar el cliente',
            description: isApiError(error, 409) ? undefined : (demoErrorMessage(error) ?? 'Inténtalo de nuevo.'),
          })
        },
      }),
    )
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title={customer.name}
        description={subtitle}
        actions={
          <div className={styles.actions}>
            <Button variant="secondary" disabled={customer.archived} onClick={() => setEditing(true)}>
              Editar cliente
            </Button>
            {isAdmin && !customer.archived && customer.portalAccess === 'none' && (
              <Button variant="secondary" onClick={() => setInvitingToPortal(true)}>
                Dar acceso al portal
              </Button>
            )}
            {isAdmin &&
              (customer.archived ? (
                <Button loading={restore.isPending} loadingLabel="Restaurando…" onClick={restoreCustomer}>
                  Restaurar
                </Button>
              ) : (
                <Button variant="danger" onClick={() => setConfirmingArchive(true)}>
                  Archivar
                </Button>
              ))}
          </div>
        }
      />

      <LockTimeoutAlert
        error={restore.error}
        pending={restore.isPending}
        onRetry={restoreSubmission.retry}
        what="restaurar el cliente"
      />

      {customer.archived && (
        <Alert tone="blue" title="Cliente archivado">
          No aparece en la lista de clientes y su acceso al portal está suspendido.{' '}
          {isAdmin
            ? 'Restáuralo para poder editar sus datos y sus notas.'
            : 'Pide a un administrador que lo restaure para editarlo.'}
        </Alert>
      )}

      <div className={styles.top}>
        <aside className={styles.profile} aria-labelledby="customer-profile-title">
          <h2 id="customer-profile-title" className="visually-hidden">
            Perfil
          </h2>
          <Avatar name={customer.name} size="large" decorative />
          <dl className={styles.facts}>
            <Fact label="Correo" value={customer.email} />
            <Fact label="Empresa" value={customer.company ?? 'Sin empresa'} />
          </dl>
          <div className={styles.badges}>
            {customer.archived && <Badge tone="neutral">Archivado</Badge>}
            <Badge tone={portal.tone}>{portal.label}</Badge>
          </div>
        </aside>

        <section className={styles.context} aria-labelledby="customer-context-title">
          <h2 id="customer-context-title" className={styles.contextTitle}>
            Contexto de atención
          </h2>
          <p>{ticketContext(customer)}</p>
          <p className={styles.contextNotes}>{customer.notes?.trim() || 'Todavía no hay notas sobre este cliente.'}</p>
        </section>
      </div>

      <div className={styles.tabs}>
        <Tabs
          label="Información del cliente"
          items={[
            {
              id: 'tickets',
              label: 'Tickets',
              content: <CustomerTickets customerId={customer.id} customerName={customer.name} />,
            },
            {
              id: 'notes',
              label: 'Notas',
              content: <Notes customer={customer} draft={notesDraft} onDraftChange={setNotesDraft} />,
            },
          ]}
        />
      </div>

      <CustomerFormDialog mode="edit" customer={customer} open={editing} onClose={closeEdit} />
      <Modal
        open={invitingToPortal}
        onClose={closePortalInvite}
        title="Dar acceso al portal"
        description={`${customer.name} entrará al portal con ${customer.email}; todavía no enviamos correos de invitación.`}
        footer={
          <>
            <Button variant="secondary" onClick={closePortalInvite}>
              Cancelar
            </Button>
            <Button loading={invite.isPending} loadingLabel="Invitando…" onClick={inviteToPortal}>
              Dar acceso
            </Button>
          </>
        }
      >
        <LockTimeoutAlert
          error={invite.error}
          pending={invite.isPending}
          onRetry={inviteSubmission.retry}
          what="dar acceso al portal"
        />
        {invite.error && !isLockTimeout(invite.error) && (
          <Alert tone="red" title="No se pudo dar acceso al portal" live>
            {isApiError(invite.error, 400)
              ? (invite.error.problem.detail ?? invite.error.problem.title)
              : mutationErrorDetail(invite.error)}
          </Alert>
        )}
      </Modal>
      <Modal
        open={confirmingArchive}
        onClose={closeArchive}
        title="¿Archivar a este cliente?"
        description={`${customer.name} dejará de aparecer en la lista y su acceso al portal se suspenderá. Podrás restaurarlo cuando quieras.`}
        footer={
          <>
            <Button variant="secondary" onClick={closeArchive}>
              Cancelar
            </Button>
            <Button variant="danger" loading={archive.isPending} loadingLabel="Archivando…" onClick={archiveCustomer}>
              Archivar cliente
            </Button>
          </>
        }
      >
        <LockTimeoutAlert
          error={archive.error}
          pending={archive.isPending}
          onRetry={archiveSubmission.retry}
          what="archivar el cliente"
        />
      </Modal>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  )
}

interface NotesProps {
  customer: CustomerDetail
  /** `null` es «sin tocar»: mientras no se edita, el campo sigue a la versión recargada (p. ej. tras un 412). */
  draft: string | null
  onDraftChange: (update: string | null | ((current: string | null) => string | null)) => void
}

function Notes({ customer, draft, onDraftChange: setDraft }: NotesProps) {
  const update = useUpdateCustomer(customer.id)
  const submission = useRepeatableSubmission()
  const toast = useToast()
  const saved = customer.notes ?? ''
  const value = draft ?? saved
  const dirty = draft !== null && draft !== saved
  const conflict = update.error && isApiError(update.error, 412)
  const archivedError = update.error && isApiError(update.error, 409)

  function save() {
    if (update.isPending || draft === null) return
    const sent = draft
    // El reintento de un 503 repite esta llamada con su versión: si otra persona guardó entretanto, responde el 412.
    const variables = { version: customer.version, changes: { notes: sent.trim() || null } }
    submission.send(() =>
      update.mutate(variables, {
        onSuccess: () => {
          // Solo se suelta el borrador si no se escribió nada nuevo mientras se guardaba.
          setDraft((current) => (current === sent ? null : current))
          toast.show({ title: 'Cambios guardados' })
        },
        onError: (error) => {
          if (!isApiError(error, 412) && !isApiError(error, 409) && !isLockTimeout(error)) {
            toast.show({
              tone: 'error',
              title: 'No se pudieron guardar las notas',
              description: demoErrorMessage(error) ?? 'Inténtalo de nuevo.',
            })
          }
        },
      }),
    )
  }

  return (
    <form
      className={styles.notes}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      {conflict && !customer.archived && (
        <Alert tone="amber" title="El cliente cambió mientras editabas las notas" live>
          Otra persona lo actualizó y ya cargamos la versión actual. Tu texto sigue aquí: revísalo y guarda de nuevo.
        </Alert>
      )}
      <LockTimeoutAlert
        error={update.error}
        pending={update.isPending}
        onRetry={submission.retry}
        what="guardar las notas"
      />
      {(customer.archived || archivedError) && (
        <Alert tone="red" title="El cliente está archivado" live={Boolean(archivedError) || draft !== null}>
          Ya no se pueden editar sus notas. Solo un administrador puede restaurarlo.
        </Alert>
      )}
      <Textarea
        label="Notas internas"
        hint={
          customer.archived
            ? 'Edición desactivada: el cliente está archivado.'
            : 'Solo las ve el equipo. Contexto útil para quien atienda a este cliente.'
        }
        rows={8}
        maxLength={MAX_NOTES}
        value={value}
        disabled={customer.archived}
        onChange={(event) => {
          setDraft(event.target.value)
          if (update.isError) update.reset()
        }}
      />
      <div className={styles.notesActions}>
        <Button
          type="submit"
          disabled={customer.archived || !dirty}
          loading={update.isPending}
          loadingLabel="Guardando…"
        >
          Guardar notas
        </Button>
      </div>
    </form>
  )
}
