import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from 'react'
import type { To } from 'react-router'
import { Alert, Button } from '../../components/ui'
import type { TicketSummary } from '../../domain/ticket'
import { groupByDay } from './dateGroups'
import { InboxItem, InboxItemGhost } from './InboxItem'
import { INBOX_PAGE_SIZE } from './queries'
import type { TicketSort } from './inboxParams'
import { groupsByDay, showingCount, sortFooters } from './inboxText'
import styles from './InboxList.module.css'

export interface InboxListProps {
  items: readonly TicketSummary[]
  /** Cuántos tickets hay en total para el filtro actual. */
  totalItems: number
  /** Número del ticket abierto en la vista previa. */
  selectedNumber?: number
  /** Destino del enlace de cada fila. */
  linkTo: (ticket: TicketSummary) => To
  /** El orden con el que llegó la lista: decide si hay grupos por día y qué dice el pie. */
  sort: TicketSort
  customerView?: boolean
  /** Menú de acciones de cada fila; cada uno lleva su propia mutación, así que sus avisos no se pisan. */
  renderActions?: (ticket: TicketSummary) => ReactNode
  timeZone: string
  hasMore: boolean
  loadingMore: boolean
  /** Falló la última carga de más tickets: se conservan los ya cargados. */
  loadMoreFailed: boolean
  onLoadMore: () => void
}

/**
 * La lista de tickets agrupada por día, con una sola parada de Tab (la fila activa) y flechas para moverse entre filas.
 * Las cabeceras de grupo quedan pegadas arriba al desplazarse; «Cargar más» deja el foco en la primera fila nueva.
 */
export function InboxList({
  items,
  totalItems,
  selectedNumber,
  linkTo,
  sort,
  customerView,
  renderActions,
  timeZone,
  hasMore,
  loadingMore,
  loadMoreFailed,
  onLoadMore,
}: InboxListProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = useState<string>()
  const focusFrom = useRef<number | null>(null)
  const now = useMinuteClock()
  // Con otro orden que la fecha de actualización los grupos por día no se sostienen: lista plana, sin cabeceras.
  const grouped = groupsByDay(sort)
  const sections = grouped
    ? groupByDay(items, (ticket) => new Date(ticket.updatedAt), now, timeZone)
    : [{ group: 'older' as const, label: '', items: [...items] }]

  // La parada de Tab es la última fila enfocada, si sigue en la lista; si no, la abierta y, si no, la primera.
  const tabStopId =
    items.find((ticket) => ticket.id === activeId)?.id ??
    items.find((ticket) => ticket.number === selectedNumber)?.id ??
    items[0]?.id

  const links = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('a[data-inbox-item]') ?? [])

  // Tras «Cargar más», el foco pasa a la primera fila recién llegada: el botón puede desaparecer con la última página.
  useEffect(() => {
    const from = focusFrom.current
    if (from !== null && items.length > from) {
      focusFrom.current = null
      links()[from]?.focus()
    }
  }, [items.length])

  // El foco entra en una fila (con el teclado, con un clic o desde «Cargar más»): esa pasa a ser la parada de Tab.
  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const id = event.target instanceof HTMLElement ? event.target.dataset.ticketId : undefined
    if (id) setActiveId(id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-inbox-item')) return
    const rows = links()
    const index = rows.indexOf(event.target)
    let target: HTMLElement | undefined
    if (event.key === 'ArrowDown') target = rows[index + 1]
    else if (event.key === 'ArrowUp') target = rows[index - 1]
    else if (event.key === 'Home') target = rows[0]
    else if (event.key === 'End') target = rows.at(-1)
    else return
    event.preventDefault()
    target?.focus()
  }

  const remaining = Math.max(totalItems - items.length, 0)
  return (
    <>
      <div className={styles.scroller}>
        <div ref={listRef} onKeyDown={onKeyDown} onFocus={onFocus}>
          {sections.map((section) => (
            <section key={section.group} className={styles.section}>
              {grouped && <h2 className={styles.groupHeader}>{section.label}</h2>}
              <ul className={styles.list}>
                {section.items.map((ticket) => (
                  <InboxItem
                    key={ticket.id}
                    ticket={ticket}
                    to={linkTo(ticket)}
                    selected={ticket.number === selectedNumber}
                    customerView={customerView}
                    tabStop={ticket.id === tabStopId}
                    actions={renderActions?.(ticket)}
                    timeZone={timeZone}
                    now={now}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        {(hasMore || loadMoreFailed) && (
          <div className={styles.more}>
            {loadMoreFailed && (
              <Alert tone="red" title="No pudimos cargar más tickets" live>
                Los que ya ves siguen aquí.
              </Alert>
            )}
            <Button
              variant="secondary"
              loading={loadingMore}
              loadingLabel="Cargando…"
              onClick={() => {
                focusFrom.current = items.length
                onLoadMore()
              }}
            >
              {loadMoreFailed ? 'Reintentar cargar más tickets' : `Cargar ${Math.min(INBOX_PAGE_SIZE, remaining)} más`}
            </Button>
          </div>
        )}
      </div>
      <p className={styles.footer} role="status">
        {showingCount(Math.min(items.length, totalItems), totalItems)} · {sortFooters[sort]}
      </p>
    </>
  )
}

/** «Ahora», renovado cada minuto: los grupos (Hoy, Ayer) y las horas relativas siguen a la lista abierta toda la noche. */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** Marcador de la lista mientras carga: filas con la altura real, sin saltos al llegar los datos. */
export function InboxListSkeleton({
  rows = 6,
  grouped = true,
  children,
}: {
  rows?: number
  /** Con grupos por día la primera fila va bajo una cabecera; con otro orden, no. */
  grouped?: boolean
  children?: ReactNode
}) {
  return (
    <div className={styles.scroller} role="status">
      <span className="visually-hidden">Cargando tickets…</span>
      {/* La cabecera de grupo que traerán los datos: la primera fila queda donde estará la real. */}
      {grouped && (
        <div className={styles.groupHeader} aria-hidden="true">
          {'\u00a0'}
        </div>
      )}
      <ul className={styles.list}>
        {Array.from({ length: rows }, (_, index) => (
          <InboxItemGhost key={index} />
        ))}
      </ul>
      {children}
    </div>
  )
}
