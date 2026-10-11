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
                <span className={styles.email}>{breakAfterAt(member.email)}</span>
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
                Cancelar
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

/** El correo con un punto de corte tras la «@»: si no cabe, se parte ahí y no en mitad de una palabra. */
function breakAfterAt(email: string) {
  const at = email.indexOf('@')
  if (at < 0) return email
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr />
      {email.slice(at + 1)}
    </>
  )
}

/**
 * Invitaciones de relleno para reservar el sitio: tres filas y «Ver las N», lo máximo que el panel muestra, con una
 * fecha de envío de dos cifras de días para que la línea de detalle mida lo que mide una real.
 */
function placeholders(now: Date): TeamMember[] {
  const invitedAt = new Date(now.getTime() - 12 * 86_400_000).toISOString()
  return Array.from({ length: INVITATIONS_PREVIEW_SIZE + 1 }, (_, index) => ({
    id: `placeholder-${index}`,
    name: '',
    email: 'persona@empresa.com',
    role: 'agent',
    status: 'invited',
    openTickets: 0,
    urgentOpenTickets: 0,
    joinedAt: null,
    invitedAt,
  }))
}

/**
 * El panel real, oculto con `visibility`, mientras llega la lista: así un administrador no ve aparecer un panel de
 * 450 px entre otros dos. Si luego hay menos invitaciones (o ninguna), la página solo se contrae.
 */
export function InvitationsSkeleton() {
  const [invitations] = useState(() => placeholders(new Date()))
  return (
    <>
      {/* El aviso va fuera del contenedor oculto: `visibility: hidden` lo sacaría del árbol de accesibilidad. */}
      <span className="visually-hidden" role="status">
        Cargando las invitaciones…
      </span>
      <div className={styles.reserved} aria-hidden="true">
        <InvitationsPanel invitations={invitations} onCancel={() => {}} onSeeAll={() => {}} />
      </div>
    </>
  )
}
