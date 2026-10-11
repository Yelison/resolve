import { useId, useState, type Ref } from 'react'
import { Avatar, Button } from '../../components/ui'
import type { TeamMember } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import { invitationsCount } from './teamCopy'
import { INVITATIONS_PREVIEW_SIZE, sentLabel } from './teamInvitations'
import styles from './InvitationsPanel.module.css'

export interface InvitationsPanelProps {
  /** Invitaciones pendientes, de la más reciente a la más antigua. */
  invitations: TeamMember[]
  onCancel: (member: TeamMember) => void
  /** Filtra la lista de miembros por «invitación pendiente». */
  onSeeAll: () => void
  /** Título enfocable: el foco vuelve aquí tras cancelar una invitación que no era la última. */
  headingRef?: Ref<HTMLHeadingElement>
}

/**
 * Invitaciones pendientes con el correo, el rol y cuándo se enviaron. Solo se dibuja para administradores y si hay
 * alguna. No hay «Reenviar» ni «Caducada»: la aplicación no envía correos, así que solo se puede cancelar.
 */
export function InvitationsPanel({ invitations, onCancel, onSeeAll, headingRef }: InvitationsPanelProps) {
  const headingId = useId()
  // «Hace N días» se cuenta en días: basta con la hora a la que se abrió la página.
  const [now] = useState(() => new Date())
  const shown = invitations.slice(0, INVITATIONS_PREVIEW_SIZE)
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
        Invitaciones pendientes <span className={styles.count}>{invitations.length}</span>
      </h2>
      <ul className={styles.list}>
        {shown.map((member) => {
          const sent = sentLabel(member.invitedAt, now)
          return (
            <li key={member.id} className={styles.item}>
              <Avatar name={member.email} decorative />
              <span className={styles.identity}>
                <span className={styles.email}>{member.email}</span>
                <span className={styles.meta}>
                  {roleLabels[member.role]}
                  {sent && ` · ${sent}`}
                </span>
              </span>
              <Button
                variant="secondary"
                className={styles.cancel}
                aria-label={`Cancelar invitación de ${member.email}`}
                onClick={() => onCancel(member)}
              >
                Cancelar invitación
              </Button>
            </li>
          )
        })}
      </ul>
      {invitations.length > INVITATIONS_PREVIEW_SIZE && (
        <Button
          variant="secondary"
          className={styles.seeAll}
          aria-label={`Ver las ${invitationsCount(invitations.length)} pendientes`}
          onClick={onSeeAll}
        >
          Ver las {invitations.length}
        </Button>
      )}
    </section>
  )
}

/** Invitaciones de relleno para reservar el sitio: tres filas y «Ver las N», lo máximo que el panel muestra. */
const placeholders: TeamMember[] = Array.from({ length: INVITATIONS_PREVIEW_SIZE + 1 }, (_, index) => ({
  id: `placeholder-${index}`,
  name: '',
  email: 'persona@empresa.com',
  role: 'agent',
  status: 'invited',
  openTickets: 0,
  urgentOpenTickets: 0,
  joinedAt: null,
  invitedAt: null,
}))

/**
 * El panel real, oculto con `visibility`, mientras llega la lista: así un administrador no ve aparecer un panel de
 * 450 px entre otros dos. Si luego hay menos invitaciones (o ninguna), la página solo se contrae.
 */
export function InvitationsSkeleton() {
  return (
    <div className={styles.reserved} role="status">
      <span className="visually-hidden">Cargando las invitaciones…</span>
      <div aria-hidden="true">
        <InvitationsPanel invitations={placeholders} onCancel={() => {}} onSeeAll={() => {}} />
      </div>
    </div>
  )
}
