import { useId, type Ref } from 'react'
import { Avatar, Button } from '../../components/ui'
import type { TeamMember } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import { formatRelative } from '../../lib/format'
import { invitationsCount } from './teamCopy'
import styles from './InvitationsPanel.module.css'

/** Invitaciones que se ven sin filtrar; el resto está en «Ver las N». */
export const INVITATIONS_PREVIEW_SIZE = 3

/** Las invitaciones pendientes, la más reciente primero; las que no traen fecha, al final. */
export function pendingInvitations(members: readonly TeamMember[]): TeamMember[] {
  const time = (member: TeamMember) => (member.invitedAt ? Date.parse(member.invitedAt) : -Infinity)
  return members
    .filter((member) => member.status === 'invited' && member.role !== 'customer')
    .sort((a, b) => time(b) - time(a) || a.email.localeCompare(b.email, 'es'))
}

export interface InvitationsPanelProps {
  /** Invitaciones pendientes, de la más reciente a la más antigua. */
  invitations: TeamMember[]
  onCancel: (member: TeamMember) => void
  /** Filtra la lista de miembros por «invitación pendiente». */
  onSeeAll: () => void
  /** Título enfocable: el foco vuelve aquí tras cancelar una invitación que no era la última. */
  headingRef?: Ref<HTMLHeadingElement>
  now?: Date
}

/**
 * «Enviada hace 2 días», «Enviada ayer», «Enviada hace 3 horas». De dos días a un mes cuenta días enteros (sin el
 * «anteayer» del formato relativo, que no dice cuántos son). Sin fecha, no se inventa una.
 */
export function sentLabel(invitedAt: string | null, now: Date): string | null {
  if (!invitedAt) return null
  const sent = new Date(invitedAt)
  const days = Math.floor((now.getTime() - sent.getTime()) / 86_400_000)
  return days >= 2 && days < 30 ? `Enviada hace ${days} días` : `Enviada ${formatRelative(sent, now)}`
}

/**
 * Invitaciones pendientes con el correo, el rol y cuándo se enviaron. Solo se dibuja para administradores y si hay
 * alguna. No hay «Reenviar» ni «Caducada»: la aplicación no envía correos, así que solo se puede cancelar.
 */
export function InvitationsPanel({
  invitations,
  onCancel,
  onSeeAll,
  headingRef,
  now = new Date(),
}: InvitationsPanelProps) {
  const headingId = useId()
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
                aria-label={`Cancelar la invitación de ${member.email}`}
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
