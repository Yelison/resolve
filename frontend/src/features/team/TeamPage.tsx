import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button, type MenuItem } from '../../components/ui'
import type { TeamMember } from '../../domain/member'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { focusPageHeading, focusPageHeadingIfFocusLost } from '../../lib/focusPageHeading'
import { useMe } from '../session/queries'
import { CancelInvitationDialog } from './CancelInvitationDialog'
import { ChangeRoleDialog } from './ChangeRoleDialog'
import { InvitationsPanel, InvitationsSkeleton } from './InvitationsPanel'
import { InviteMemberDialog } from './InviteMemberDialog'
import { LoadPanel } from './LoadPanel'
import { MembersPanel } from './MembersPanel'
import { RemoveMemberDialog } from './RemoveMemberDialog'
import { RolesPanel } from './RolesPanel'
import { pendingInvitations } from './teamInvitations'
import { readTeamState, writeTeamState, type TeamPageState } from './teamParams'
import { useTeam, useTeamMetrics } from './queries'
import styles from './TeamPage.module.css'

/**
 * Equipo: carga ahora, invitaciones pendientes, roles y lista de miembros. Todo el personal ve la página; solo un
 * administrador ve «Invitar agente», el panel de invitaciones y el menú de acciones de cada fila (Q-03): un agente ve
 * la carga, los roles y los miembros. La guardia de rol la pone la ruta (`sectionRoute`).
 *
 * El estado que cambia lo que se ve (búsqueda, filtros, página, carga desplegada y su vista) vive en la URL: ningún
 * «Ver todos» abre otra página, y deshacerlo es quitar el filtro o plegar la sección.
 */
export function TeamPage() {
  const me = useMe()
  const team = useTeam()
  const metrics = useTeamMetrics()
  const [searchParams, setSearchParams] = useSearchParams()
  const state = readTeamState(searchParams)
  const [inviting, setInviting] = useState(false)
  const [changingRole, setChangingRole] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState<TeamMember | null>(null)
  const [cancelling, setCancelling] = useState<TeamMember | null>(null)
  const invitationsHeading = useRef<HTMLHeadingElement>(null)

  // Sin conocer el rol no se dibuja ninguna acción de administración: evita mostrarlas un instante a un agente.
  const isAdmin = me.data?.role === 'admin'
  const selfId = me.data?.user.id

  const update = (changes: Partial<TeamPageState>) =>
    setSearchParams(writeTeamState({ ...state, page: 1, ...changes }), { replace: true })

  // Si el disparador ya no existe al cerrar (un 403 ocultó las acciones), el foco no se pierde en el body.
  function closeDialog(close: () => void) {
    close()
    focusPageHeadingIfFocusLost()
  }

  // Al retirar o cancelar con éxito la fila sale de la lista, pero un instante después del cierre: el foco se lleva
  // desde un efecto para que corra después de que el diálogo devuelva el foco a su disparador.
  const [focusRequests, setFocusRequests] = useState(0)
  const focusTarget = useRef<'heading' | 'invitations' | 'members'>('heading')
  const membersHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusRequests === 0) return
    if (focusTarget.current === 'invitations' && invitationsHeading.current) invitationsHeading.current.focus()
    else if (focusTarget.current === 'members' && membersHeading.current) membersHeading.current.focus()
    else focusPageHeading()
  }, [focusRequests])

  // «Ver las N», «Quitar filtros» y «Ver el equipo actual» hacen desaparecer el botón pulsado: el foco va al título de
  // la lista, que dice cuántos miembros quedan, en lugar de caer en `body`.
  function focusMembers() {
    focusTarget.current = 'members'
    setFocusRequests((count) => count + 1)
  }

  function closeAfterRemoval() {
    setRemoving(null)
    focusTarget.current = 'heading'
    setFocusRequests((count) => count + 1)
  }

  // Si quedan otras invitaciones el foco va a su panel; si era la última, el panel desaparece y va al título.
  const invitations = team.isSuccess ? pendingInvitations(team.data) : []
  function closeAfterCancellation() {
    setCancelling(null)
    focusTarget.current = invitations.length > 1 ? 'invitations' : 'heading'
    setFocusRequests((count) => count + 1)
  }

  function actionsFor(member: TeamMember): MenuItem[] {
    if (!isAdmin || member.status === 'removed') return []
    const items: MenuItem[] = [{ id: 'role', label: 'Cambiar rol', onSelect: () => setChangingRole(member) }]
    // Una invitación no se «retira»: se cancela, con sus propios textos.
    if (member.status === 'invited') {
      items.push({ id: 'cancel', label: 'Cancelar invitación', tone: 'danger', onSelect: () => setCancelling(member) })
      // Retirarse a uno mismo es siempre un 409: la acción no se ofrece.
    } else if (member.id !== selfId) {
      items.push({
        id: 'remove',
        label: 'Retirar del equipo',
        tone: 'danger',
        onSelect: () => setRemoving(member),
      })
    }
    return items
  }

  // Mientras el filtro «invitación pendiente» está activo la lista ya dice lo mismo: el panel se oculta.
  const showInvitations = isAdmin && invitations.length > 0 && state.status !== 'invited'

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Equipo"
        description="Quién atiende, con qué carga y con qué permisos."
        actions={isAdmin ? <Button onClick={() => setInviting(true)}>Invitar agente</Button> : undefined}
      />

      <div className={styles.overview}>
        <LoadPanel
          team={team}
          metrics={metrics}
          expanded={state.allLoad}
          onExpandedChange={(allLoad) => update({ allLoad, page: state.page })}
          asTable={state.loadTable}
          onAsTableChange={(loadTable) => update({ loadTable, page: state.page })}
        />
        <div className={styles.side}>
          {/* «Roles» mide siempre lo mismo y va primero: lo que varía (las invitaciones) queda al final de la columna. */}
          <RolesPanel team={team} />
          {/* Mientras carga, un administrador ya tiene reservado el sitio del panel con su altura máxima. */}
          {isAdmin && team.isPending && <InvitationsSkeleton />}
          {showInvitations && (
            <InvitationsPanel
              invitations={invitations}
              headingRef={invitationsHeading}
              onCancel={setCancelling}
              onSeeAll={() => {
                update({ status: 'invited', role: undefined, q: '' })
                focusMembers()
              }}
            />
          )}
        </div>
      </div>

      <MembersPanel
        team={team}
        state={state}
        onChange={update}
        onPageChange={(page) => setSearchParams(writeTeamState({ ...state, page }))}
        headingRef={membersHeading}
        onFocusMembers={focusMembers}
        isAdmin={isAdmin}
        actions={actionsFor}
        onInvite={() => setInviting(true)}
      />

      <InviteMemberDialog open={inviting} onClose={() => closeDialog(() => setInviting(false))} />
      <ChangeRoleDialog member={changingRole} onClose={() => closeDialog(() => setChangingRole(null))} />
      <RemoveMemberDialog
        member={removing}
        onClose={() => closeDialog(() => setRemoving(null))}
        onRemoved={closeAfterRemoval}
      />
      <CancelInvitationDialog
        member={cancelling}
        onClose={() => closeDialog(() => setCancelling(null))}
        onCancelled={closeAfterCancellation}
      />
    </div>
  )
}
