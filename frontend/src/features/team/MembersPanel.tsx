import { useEffect, useRef, useState } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import {
  Button,
  EmptyState,
  FilterChip,
  Menu,
  Pagination,
  SearchField,
  Skeleton,
  type MenuItem,
} from '../../components/ui'
import { type MemberStatus, type TeamMember, type TeamRole } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import { TeamTable } from './TeamTable'
import { membersCount } from './teamCopy'
import { TEAM_PAGE_SIZE, filterMembers, hasActiveTeamFilters, teamPageCount, type TeamPageState } from './teamParams'
import styles from './MembersPanel.module.css'

export interface MembersPanelProps {
  team: UseQueryResult<TeamMember[]>
  state: TeamPageState
  /** Aplica cambios al estado de la URL; cualquier filtro vuelve a la primera página. */
  onChange: (changes: Partial<TeamPageState>) => void
  onPageChange: (page: number) => void
  isAdmin: boolean
  actions: (member: TeamMember) => MenuItem[]
  onInvite: () => void
}

const roleItems: TeamRole[] = ['agent', 'admin']
const statusItems: MemberStatus[] = ['active', 'invited', 'removed']
/** Cómo se nombra cada estado como filtro: en plural, salvo la invitación pendiente. */
const statusFilterLabels: Record<MemberStatus, string> = {
  active: 'Activos',
  invited: 'Invitación pendiente',
  removed: 'Retirados',
}

/** Lista compacta de miembros con buscador, filtros de rol y estado y paginación de diez. */
export function MembersPanel({ team, state, onChange, onPageChange, isAdmin, actions, onInvite }: MembersPanelProps) {
  const [searchText, setSearchText] = useState(state.q)
  const debouncedSearch = useDebouncedValue(searchText)

  // La búsqueda escrita pasa a la URL al dejar de teclear.
  const pushedSearch = useRef(state.q.trim())
  useEffect(() => {
    if (debouncedSearch.trim() !== state.q.trim()) {
      pushedSearch.current = debouncedSearch.trim()
      onChange({ q: debouncedSearch })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona al texto ya estabilizado
  }, [debouncedSearch])

  // Si la URL cambia por otra vía (atrás, un enlace, «Quitar filtros»), el campo refleja la búsqueda de la URL.
  useEffect(() => {
    if (state.q.trim() !== pushedSearch.current) {
      pushedSearch.current = state.q.trim()
      setSearchText(state.q)
    }
  }, [state.q])

  const filtersActive = hasActiveTeamFilters(state)
  const clearFilters = () => {
    setSearchText('')
    onChange({ q: '', role: undefined, status: undefined })
  }

  const total = team.isSuccess
    ? filterMembers(team.data, { ...state, q: '', role: undefined, status: undefined }).length
    : 0
  const matching = team.isSuccess ? filterMembers(team.data, state) : []
  const counter = !team.isSuccess
    ? null
    : filtersActive && state.status !== 'removed'
      ? `${matching.length} de ${total}`
      : matching.length

  return (
    <section className={styles.panel} aria-labelledby="team-members-heading">
      <div className={styles.header}>
        <h2 id="team-members-heading" className={styles.title}>
          Miembros {counter !== null && <span className={styles.count}>{counter}</span>}
        </h2>
        <SearchField
          label="Buscar miembros"
          placeholder="Nombre o correo…"
          value={searchText}
          onValueChange={setSearchText}
          fieldClassName={styles.search}
        />
        <div className={styles.filters}>
          <RoleFilter role={state.role} onChange={(role) => onChange({ role })} />
          <StatusFilter status={state.status} onChange={(status) => onChange({ status })} />
        </div>
      </div>
      <div className={styles.results}>
        <div className={styles.resultsInner}>
          <Results
            team={team}
            matching={matching}
            state={state}
            filtersActive={filtersActive}
            isAdmin={isAdmin}
            actions={actions}
            onInvite={onInvite}
            onClearFilters={clearFilters}
            onPageChange={onPageChange}
          />
        </div>
      </div>
    </section>
  )
}

function RoleFilter({ role, onChange }: { role?: TeamRole; onChange: (role: TeamRole | undefined) => void }) {
  if (role) {
    return <RemovableChip label={`Rol: ${roleLabels[role]}`} onRemove={() => onChange(undefined)} />
  }
  const items: MenuItem[] = roleItems.map((item) => ({
    id: item,
    label: roleLabels[item],
    onSelect: () => onChange(item),
  }))
  return (
    <Menu label="Filtrar por rol" items={items} placement="bottom-start">
      {(trigger) => <FilterChip {...trigger}>Rol</FilterChip>}
    </Menu>
  )
}

function StatusFilter({
  status,
  onChange,
}: {
  status?: MemberStatus
  onChange: (status: MemberStatus | undefined) => void
}) {
  if (status) {
    return <RemovableChip label={`Estado: ${statusFilterLabels[status]}`} onRemove={() => onChange(undefined)} />
  }
  const items: MenuItem[] = statusItems.map((item) => ({
    id: item,
    label: statusFilterLabels[item],
    onSelect: () => onChange(item),
  }))
  return (
    <Menu label="Filtrar por estado" items={items} placement="bottom-start">
      {(trigger) => <FilterChip {...trigger}>Estado</FilterChip>}
    </Menu>
  )
}

/** Filtro aplicado: se quita con un toque, así que volver atrás de un «Ver las N» es quitar este chip. */
function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button type="button" className={styles.chip} aria-label={`Quitar el filtro ${label}`} onClick={onRemove}>
      {label}
      <span aria-hidden="true">✕</span>
    </button>
  )
}

interface ResultsProps {
  team: UseQueryResult<TeamMember[]>
  matching: TeamMember[]
  state: TeamPageState
  filtersActive: boolean
  isAdmin: boolean
  actions: (member: TeamMember) => MenuItem[]
  onInvite: () => void
  onClearFilters: () => void
  onPageChange: (page: number) => void
}

function Results({
  team,
  matching,
  state,
  filtersActive,
  isAdmin,
  actions,
  onInvite,
  onClearFilters,
  onPageChange,
}: ResultsProps) {
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
          <Button
            variant="secondary"
            aria-label="Reintentar cargar la lista de miembros"
            onClick={() => void team.refetch()}
          >
            Reintentar
          </Button>
        }
      />
    )
  }
  if (matching.length === 0) {
    if (state.status === 'removed' && !state.q.trim() && !state.role) {
      return (
        <EmptyState
          kind="noResults"
          title="No hay miembros retirados"
          description="Quien se retire del equipo aparecerá aquí."
          action={
            <Button variant="secondary" onClick={onClearFilters}>
              Ver el equipo actual
            </Button>
          }
        />
      )
    }
    if (filtersActive) {
      return (
        <EmptyState
          kind="noResults"
          title="No encontramos miembros"
          description="Prueba otra búsqueda o quita los filtros."
          action={
            <Button variant="secondary" onClick={onClearFilters}>
              Quitar filtros
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
  if (state.page > teamPageCount(matching.length)) {
    return (
      <EmptyState
        kind="noResults"
        title="Esta página ya no existe"
        description="Hay menos miembros que antes."
        action={
          <Button variant="secondary" onClick={() => onPageChange(1)}>
            Ir a la primera página
          </Button>
        }
      />
    )
  }
  const start = (state.page - 1) * TEAM_PAGE_SIZE
  const visible = matching.slice(start, start + TEAM_PAGE_SIZE)
  return (
    <>
      <p className="visually-hidden" role="status">
        {membersCount(matching.length)}
      </p>
      <TeamTable
        members={visible}
        caption={visible.length === 1 ? 'Mostrando 1 miembro' : `Mostrando ${visible.length} miembros`}
        captionHidden
        actions={actions}
      />
      <Pagination page={state.page} pageSize={TEAM_PAGE_SIZE} total={matching.length} onPageChange={onPageChange} />
    </>
  )
}
