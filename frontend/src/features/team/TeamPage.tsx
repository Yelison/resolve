import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Alert, Button, EmptyState, FilterChip, Menu, Metric, Skeleton, type MenuItem } from '../../components/ui'
import { isCurrentMember, type TeamMember, type TeamMetrics } from '../../domain/member'
import { PageHeader } from '../../app/pages/PageHeader'
import pageStyles from '../../app/pages/Page.module.css'
import { useMe } from '../session/queries'
import { ChangeRoleDialog } from './ChangeRoleDialog'
import { InviteMemberDialog } from './InviteMemberDialog'
import { RemoveMemberDialog } from './RemoveMemberDialog'
import { TeamTable } from './TeamTable'
import { useTeam, useTeamMetrics } from './queries'
import styles from './TeamPage.module.css'

const decimal = new Intl.NumberFormat('es', { maximumFractionDigits: 1 })

/** Parámetro de la URL que muestra a los retirados, que por defecto no aparecen. */
const REMOVED_PARAM = 'estado'
const REMOVED_VALUE = 'retirados'

/**
 * Equipo: métricas, lista de miembros e invitación. Todo el personal ve la página; solo un administrador ve
 * «Invitar agente» y el menú de acciones de cada fila (Q-03). La guardia de rol la pone la ruta (`sectionRoute`).
 */
export function TeamPage() {
  const me = useMe()
  const team = useTeam()
  const metrics = useTeamMetrics()
  const [searchParams, setSearchParams] = useSearchParams()
  const showRemoved = searchParams.get(REMOVED_PARAM) === REMOVED_VALUE
  const [inviting, setInviting] = useState(false)
  const [changingRole, setChangingRole] = useState<TeamMember | null>(null)
  const [removing, setRemoving] = useState<TeamMember | null>(null)

  // Sin conocer el rol no se dibuja ninguna acción de administración: evita mostrarlas un instante a un agente.
  const isAdmin = me.data?.role === 'admin'
  const selfId = me.data?.user.id

  function actionsFor(member: TeamMember): MenuItem[] {
    if (!isAdmin || member.status === 'removed') return []
    const items: MenuItem[] = [{ id: 'role', label: 'Cambiar rol', onSelect: () => setChangingRole(member) }]
    // Retirarse a uno mismo es siempre un 409: la acción no se ofrece.
    if (member.id !== selfId) {
      items.push({
        id: 'remove',
        label: 'Retirar del equipo',
        tone: 'danger',
        onSelect: () => setRemoving(member),
      })
    }
    return items
  }

  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Equipo"
        description="Quién atiende, con qué carga y con qué permisos."
        actions={isAdmin && <Button onClick={() => setInviting(true)}>Invitar agente</Button>}
      />

      {metrics.isPending ? (
        <div className={styles.metricsPlaceholder}>
          <Skeleton lines={2} label="Cargando métricas…" />
        </div>
      ) : metrics.isError ? (
        <div className={styles.metricsPlaceholder}>
          <Alert tone="red" title="No pudimos cargar las métricas del equipo">
            <Button
              variant="secondary"
              aria-label="Reintentar cargar las métricas"
              onClick={() => void metrics.refetch()}
            >
              Reintentar
            </Button>
          </Alert>
        </div>
      ) : (
        <MetricsRow metrics={metrics.data} />
      )}

      <Alert tone="blue" title="Permisos por rol">
        Los administradores gestionan el equipo; los agentes atienden tickets y ven al equipo en lectura.{' '}
        <Link to="/configuracion/permisos" className={styles.link}>
          Ver permisos por rol
        </Link>
      </Alert>

      <section className={styles.panel} aria-label="Miembros del equipo">
        <div className={styles.filters}>
          <StatusFilter
            showRemoved={showRemoved}
            onChange={(removed) =>
              setSearchParams(removed ? { [REMOVED_PARAM]: REMOVED_VALUE } : {}, { replace: true })
            }
          />
        </div>
        <div className={styles.results}>
          <div className={styles.resultsInner}>
            <Results
              team={team}
              showRemoved={showRemoved}
              isAdmin={isAdmin}
              actions={actionsFor}
              onInvite={() => setInviting(true)}
              onShowCurrent={() => setSearchParams({}, { replace: true })}
            />
          </div>
        </div>
      </section>

      <InviteMemberDialog open={inviting} onClose={() => setInviting(false)} />
      <ChangeRoleDialog member={changingRole} onClose={() => setChangingRole(null)} />
      <RemoveMemberDialog member={removing} onClose={() => setRemoving(null)} />
    </div>
  )
}

function MetricsRow({ metrics }: { metrics: TeamMetrics }) {
  return (
    <div className={styles.metrics}>
      <Metric label="Agentes" value={metrics.staff} />
      <Metric
        label="Tickets asignados"
        value={metrics.assignedOpen}
        detail={metrics.unassignedOpen === 1 ? '1 sin asignar' : `${metrics.unassignedOpen} sin asignar`}
      />
      <Metric label="Carga promedio" value={decimal.format(metrics.averageLoad)} detail="Tickets por agente" />
      <Metric
        label="Primera respuesta"
        value={metrics.firstResponseMinutes === null ? 'Sin datos' : `${metrics.firstResponseMinutes} min`}
        detail={`Objetivo: ${metrics.firstResponseTargetMinutes} min`}
      />
    </div>
  )
}

function StatusFilter({ showRemoved, onChange }: { showRemoved: boolean; onChange: (removed: boolean) => void }) {
  const items: MenuItem[] = [
    { id: 'current', label: 'Equipo actual', onSelect: () => onChange(false) },
    { id: 'removed', label: 'Retirados', onSelect: () => onChange(true) },
  ]
  return (
    <Menu label="Filtrar por estado" items={items} placement="bottom-start">
      {(trigger) => (
        <FilterChip selected={showRemoved} {...trigger}>
          {showRemoved ? 'Estado: Retirados' : 'Estado'}
        </FilterChip>
      )}
    </Menu>
  )
}

interface ResultsProps {
  team: ReturnType<typeof useTeam>
  showRemoved: boolean
  isAdmin: boolean
  actions: (member: TeamMember) => MenuItem[]
  onInvite: () => void
  onShowCurrent: () => void
}

function Results({ team, showRemoved, isAdmin, actions, onInvite, onShowCurrent }: ResultsProps) {
  if (team.isPending) {
    return (
      <div className={styles.loading}>
        <Skeleton lines={2} label="Cargando el equipo…" />
        <Skeleton lines={2} label="" />
        <Skeleton lines={2} label="" />
      </div>
    )
  }
  if (team.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar el equipo"
        description="Revisa tu conexión y vuelve a intentarlo."
        live={team.failureCount > 1}
        action={
          <Button variant="secondary" onClick={() => void team.refetch()}>
            Reintentar
          </Button>
        }
      />
    )
  }
  const members = team.data.filter((member) => (showRemoved ? member.status === 'removed' : isCurrentMember(member)))
  if (members.length === 0) {
    if (showRemoved) {
      return (
        <EmptyState
          kind="noResults"
          title="No hay miembros retirados"
          description="Quien se retire del equipo aparecerá aquí."
          action={
            <Button variant="secondary" onClick={onShowCurrent}>
              Ver el equipo actual
            </Button>
          }
        />
      )
    }
    return (
      <EmptyState
        icon="team"
        title="Todavía no hay equipo"
        description={
          isAdmin
            ? 'Invita a la primera persona para repartir los tickets.'
            : 'Un administrador puede invitar a las primeras personas.'
        }
        action={isAdmin ? <Button onClick={onInvite}>Invitar agente</Button> : undefined}
      />
    )
  }
  return (
    <>
      <p className="visually-hidden" role="status">
        {members.length === 1 ? '1 miembro' : `${members.length} miembros`}
      </p>
      <TeamTable
        members={members}
        caption={members.length === 1 ? 'Mostrando 1 miembro' : `Mostrando ${members.length} miembros`}
        actions={actions}
      />
    </>
  )
}
