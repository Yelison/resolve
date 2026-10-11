import { useId } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Avatar, Button, EmptyState, Skeleton } from '../../components/ui'
import type { TeamMember, TeamMetrics } from '../../domain/member'
import { LOAD_PREVIEW_SIZE, loadEntries, loadScale, type LoadEntry } from './teamLoad'
import { openCount, openTicketsTotal, peopleCount, unassignedCount, urgentCount } from './teamCopy'
import styles from './LoadPanel.module.css'

export interface LoadPanelProps {
  team: UseQueryResult<TeamMember[]>
  metrics: UseQueryResult<TeamMetrics>
  /** `true` muestra a todas las personas; si no, las más cargadas. */
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  /** `true` sustituye las barras por su tabla. */
  asTable: boolean
  onAsTableChange: (asTable: boolean) => void
}

/**
 * «Carga ahora»: una barra por persona activa con sus tickets abiertos, los urgentes en su propio color y rayado.
 * Cada fila dice también sus cifras con palabras y «Ver como tabla» da la alternativa textual, así que el color
 * nunca es lo único que informa. El total y los sin asignar vienen de las métricas, que pueden fallar sin tapar las barras.
 */
export function LoadPanel({ team, metrics, expanded, onExpandedChange, asTable, onAsTableChange }: LoadPanelProps) {
  const headingId = useId()
  const entries = team.isSuccess ? loadEntries(team.data) : []
  const overflowing = entries.length > LOAD_PREVIEW_SIZE
  const shown = expanded ? entries : entries.slice(0, LOAD_PREVIEW_SIZE)
  const scope = !overflowing
    ? ''
    : expanded
      ? ` · las ${peopleCount(entries.length)}, de más a menos`
      : ` · los ${LOAD_PREVIEW_SIZE} más cargados`

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.header}>
        <h2 id={headingId} className={styles.title}>
          Carga ahora
        </h2>
        <Totals metrics={metrics} scope={scope} />
      </div>
      <Body
        team={team}
        shown={shown}
        asTable={asTable}
        overflowing={overflowing}
        expanded={expanded}
        total={entries.length}
        onExpandedChange={onExpandedChange}
        onAsTableChange={onAsTableChange}
      />
    </section>
  )
}

function Totals({ metrics, scope }: { metrics: UseQueryResult<TeamMetrics>; scope: string }) {
  if (metrics.isPending) {
    return (
      <div className={styles.totals}>
        <Skeleton lines={1} label="Cargando los totales…" className={styles.totalsSkeleton} />
      </div>
    )
  }
  if (metrics.isError) {
    return (
      <p className={styles.totals} role="alert">
        No pudimos cargar los totales.{' '}
        <button
          type="button"
          className={styles.retry}
          aria-label="Reintentar cargar los totales de tickets"
          onClick={() => void metrics.refetch()}
        >
          Reintentar
        </button>
      </p>
    )
  }
  const { assignedOpen, unassignedOpen } = metrics.data
  return (
    <p className={styles.totals}>
      {openTicketsTotal(assignedOpen + unassignedOpen)} · {unassignedCount(unassignedOpen)}
      {scope}
    </p>
  )
}

interface BodyProps {
  team: UseQueryResult<TeamMember[]>
  shown: LoadEntry[]
  asTable: boolean
  overflowing: boolean
  expanded: boolean
  total: number
  onExpandedChange: (expanded: boolean) => void
  onAsTableChange: (asTable: boolean) => void
}

function Body({ team, shown, asTable, overflowing, expanded, total, onExpandedChange, onAsTableChange }: BodyProps) {
  if (team.isPending) return <LoadSkeleton />
  if (team.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar la carga del equipo"
        description="Revisa tu conexión y vuelve a intentarlo."
        live={team.failureCount > 1}
        action={
          <Button
            variant="secondary"
            aria-label="Reintentar cargar la carga del equipo"
            onClick={() => void team.refetch()}
          >
            Reintentar
          </Button>
        }
      />
    )
  }
  if (shown.length === 0) {
    return (
      <EmptyState
        icon="team"
        title="Nadie atiende tickets todavía"
        description="Cuando alguien acepte su invitación verás aquí su carga."
      />
    )
  }
  return (
    <>
      {asTable ? <LoadTable entries={shown} /> : <LoadBars entries={shown} />}
      <div className={styles.footer}>
        {!asTable && <Legend />}
        <div className={styles.actions}>
          {overflowing && (
            <Button variant="secondary" aria-expanded={expanded} onClick={() => onExpandedChange(!expanded)}>
              {expanded ? `Ver solo las ${LOAD_PREVIEW_SIZE} más cargadas` : `Ver las ${peopleCount(total)}`}
            </Button>
          )}
          <Button variant="secondary" aria-pressed={asTable} onClick={() => onAsTableChange(!asTable)}>
            {asTable ? 'Ver como gráfico' : 'Ver como tabla'}
          </Button>
        </div>
      </div>
    </>
  )
}

function LoadBars({ entries }: { entries: LoadEntry[] }) {
  const scale = loadScale(entries)
  return (
    <ul className={styles.list} aria-label="Tickets abiertos por persona">
      {entries.map(({ member, open, urgent, rest }) => (
        <li key={member.id} className={styles.row}>
          <span className={styles.who}>
            <Avatar name={member.name} size="small" decorative />
            <span className={styles.name}>{member.name}</span>
          </span>
          <span className={styles.bar} aria-hidden="true">
            <span className={styles.urgent} style={{ width: `${(urgent / scale) * 100}%` }} />
            <span className={styles.rest} style={{ width: `${(rest / scale) * 100}%` }} />
          </span>
          <span className={styles.count}>
            {openCount(open)}
            {urgent > 0 && <span className={styles.urgentText}> · {urgentCount(urgent)}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="Leyenda">
      <li className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.urgent}`} aria-hidden="true" />
        Urgentes
      </li>
      <li className={styles.legendItem}>
        <span className={`${styles.swatch} ${styles.rest}`} aria-hidden="true" />
        Resto
      </li>
    </ul>
  )
}

function LoadTable({ entries }: { entries: LoadEntry[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <caption className="visually-hidden">Tickets abiertos por persona</caption>
        <thead>
          <tr>
            <th scope="col">Persona</th>
            <th scope="col" className={styles.number}>
              Abiertos
            </th>
            <th scope="col" className={styles.number}>
              Urgentes
            </th>
            <th scope="col" className={styles.number}>
              Resto
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ member, open, urgent, rest }) => (
            <tr key={member.id}>
              <th scope="row">{member.name}</th>
              <td className={styles.number}>{open}</td>
              <td className={styles.number}>{urgent}</td>
              <td className={styles.number}>{rest}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Mismas filas que las barras, para que la página no salte cuando llegan los datos. */
function LoadSkeleton() {
  return (
    <div role="status" className={styles.list}>
      <span className="visually-hidden">Cargando la carga del equipo…</span>
      {Array.from({ length: LOAD_PREVIEW_SIZE }, (_, index) => (
        <div key={index} className={styles.row} aria-hidden="true">
          <span className={styles.who}>
            <span className={styles.placeholderAvatar} />
            <span className={styles.placeholderName} />
          </span>
          <span className={styles.bar} />
          <span className={styles.count}>
            <span className={styles.placeholderName} />
          </span>
        </div>
      ))}
    </div>
  )
}
