import { useEffect, useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import type { ArticleSummary, CustomerSummary, TicketSummary } from '../../api/schema'
import { Badge, EmptyState, Modal, SearchField, Skeleton, ticketStatus } from '../../components/ui'
import { cx } from '../../lib/cx'
import { useMe } from '../session/queries'
import styles from './GlobalSearch.module.css'
import { searchGroupsFor, type SearchGroupDefinition, type SearchGroupId } from './groups'
import { MIN_SEARCH_LENGTH, useGlobalSearch, type GroupResult } from './useGlobalSearch'

interface GlobalSearchProps {
  open: boolean
  onClose: () => void
}

/**
 * Búsqueda global: un diálogo con un campo y los resultados de tickets, clientes y artículos a la vez. Cada resultado
 * lleva a su detalle y cada grupo, a su listado con `?q=`. Solo se busca en lo que el rol de la sesión puede abrir.
 */
export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const me = useMe()
  // Sin sesión no se conoce el rol y el servidor rechazaría las peticiones: no se ofrece ningún grupo.
  const sessionFailed = !me.data && me.errorUpdateCount > 0
  const groups = sessionFailed ? [] : searchGroupsFor(me.data?.role)

  return (
    <Modal open={open} onClose={onClose} title="Buscar" size="wide" className={styles.dialog}>
      <SearchPanel groups={groups} onClose={onClose} />
    </Modal>
  )
}

interface Row {
  key: string
  node: ReactNode
  run: () => void
}

interface Section {
  group: SearchGroupDefinition
  kind: 'rows' | 'loading'
  rows: Row[]
  stale: boolean
}

function SearchPanel({ groups, onClose }: { groups: SearchGroupDefinition[]; onClose: () => void }) {
  const navigate = useNavigate()
  const listboxId = useId()
  const [text, setText] = useState('')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const search = useGlobalSearch(
    text,
    groups.map((group) => group.id),
  )

  const go = (to: string) => {
    onClose()
    void navigate(to)
  }
  const results: Record<SearchGroupId, GroupResult<unknown>> = {
    tickets: search.tickets,
    customers: search.customers,
    articles: search.articles,
  }

  const sections: Section[] = []
  for (const group of groups) {
    const result = results[group.id]
    if (result.status === 'idle' || result.status === 'forbidden') continue
    if (result.status === 'loading') {
      sections.push({ group, kind: 'loading', rows: [], stale: false })
      continue
    }
    if (result.status === 'error') {
      sections.push({
        group,
        kind: 'rows',
        stale: false,
        rows: [
          {
            key: `${group.id}:retry`,
            run: result.retry,
            node: (
              <>
                <span className={cx(styles.text, styles.error)}>No se pudo buscar en {group.seeAll}. </span>
                <span className={styles.seeAll}>Reintentar {group.seeAll}</span>
              </>
            ),
          },
        ],
      })
      continue
    }
    if (result.items.length === 0) continue
    const rows = rowsFor(group.id, result.items, go)
    rows.push({
      key: `${group.id}:all`,
      run: () => go(`${listPath[group.id]}?${new URLSearchParams({ q: search.term })}`),
      node: <span className={cx(styles.text, styles.seeAll)}>Ver todos los resultados de {group.seeAll}</span>,
    })
    sections.push({ group, kind: 'rows', rows, stale: result.stale })
  }

  const rows = sections.flatMap((section) => section.rows)
  const activeRow = rows.find((row) => row.key === activeKey)
  const optionId = (key: string) => `${listboxId}-${key}`
  const pending =
    !search.settled || groups.some((group) => results[group.id].status === 'loading' || results[group.id].stale)

  useEffect(() => {
    if (activeKey) document.getElementById(`${listboxId}-${activeKey}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeKey, listboxId])

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (rows.length === 0) return
      const index = activeRow ? rows.indexOf(activeRow) : -1
      const next = event.key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0)
      setActiveKey(rows[next]!.key)
    } else if (event.key === 'Enter' && activeRow && !event.nativeEvent.isComposing) {
      event.preventDefault()
      activeRow.run()
    }
  }

  const typed = text.trim()
  const announcement = announce(search, groups, pending)

  return (
    <>
      <SearchField
        label="Buscar en Resolve"
        placeholder="Tickets, clientes y artículos…"
        value={text}
        onValueChange={(value) => {
          setText(value)
          setActiveKey(null)
        }}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={rows.length > 0}
        aria-controls={rows.length > 0 ? listboxId : undefined}
        aria-activedescendant={activeRow ? optionId(activeRow.key) : undefined}
        // Escape siempre cierra el diálogo. Con texto, el navegador lo usaría antes para vaciar el campo de búsqueda
        // (y SearchField, para borrarlo): se cierra aquí y se impide ese uso.
        onKeyDownCapture={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        onKeyDown={onKeyDown}
      />
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
      <div className={styles.results} aria-busy={pending}>
        {groups.length === 0 ? (
          <EmptyState
            kind="restricted"
            headingLevel={3}
            title="La búsqueda no está disponible"
            description="No se puede buscar mientras la sesión no esté disponible."
          />
        ) : typed.length < MIN_SEARCH_LENGTH ? (
          <p className={styles.hint}>Escribe al menos {MIN_SEARCH_LENGTH} caracteres para buscar.</p>
        ) : sections.length === 0 && pending ? (
          <p className={styles.hint}>Buscando…</p>
        ) : sections.length === 0 ? (
          <EmptyState
            kind="noResults"
            headingLevel={3}
            title="Sin resultados"
            description={`No hay nada que coincida con «${search.term}».`}
          />
        ) : (
          <div
            id={rows.length > 0 ? listboxId : undefined}
            role={rows.length > 0 ? 'listbox' : undefined}
            aria-label={rows.length > 0 ? 'Resultados de la búsqueda' : undefined}
            className={styles.list}
          >
            {sections.map((section) =>
              section.kind === 'loading' ? (
                <div key={section.group.id} role="presentation" aria-hidden="true" className={styles.group}>
                  <div className={styles.heading}>{section.group.label}</div>
                  <Skeleton lines={3} label={`Buscando en ${section.group.seeAll}…`} />
                </div>
              ) : (
                <div
                  key={section.group.id}
                  role="group"
                  aria-labelledby={`${listboxId}-${section.group.id}`}
                  className={cx(styles.group, section.stale && styles.stale)}
                >
                  <div id={`${listboxId}-${section.group.id}`} className={styles.heading}>
                    {section.group.label}
                  </div>
                  {section.rows.map((row) => (
                    <div
                      key={row.key}
                      id={optionId(row.key)}
                      role="option"
                      aria-selected={row.key === activeRow?.key}
                      className={cx(styles.option, row.key === activeRow?.key && styles.active)}
                      // El foco se queda en el campo: pulsar un resultado no debe quitárselo antes del clic.
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={row.run}
                    >
                      {row.node}
                    </div>
                  ))}
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </>
  )
}

const listPath: Record<SearchGroupId, string> = {
  tickets: '/tickets',
  customers: '/clientes',
  articles: '/conocimiento',
}

/** Las filas de un grupo con sus resultados; `items` es del tipo de ese grupo. */
function rowsFor(id: SearchGroupId, items: unknown[], go: (to: string) => void): Row[] {
  switch (id) {
    case 'tickets':
      return (items as TicketSummary[]).map((ticket) => ({
        key: `tickets:${ticket.id}`,
        run: () => go(`/tickets/${ticket.number}`),
        node: (
          <>
            <span className={styles.text}>
              <span className={styles.primary}>
                <span className={styles.number}>#{ticket.number}</span> {ticket.subject}
              </span>
            </span>
            <Badge tone={ticketStatus[ticket.status].tone}>{ticketStatus[ticket.status].label}</Badge>
          </>
        ),
      }))
    case 'customers':
      return (items as CustomerSummary[]).map((customer) => ({
        key: `customers:${customer.id}`,
        run: () => go(`/clientes/${customer.id}`),
        node: (
          <span className={styles.text}>
            <span className={styles.primary}>{customer.name}</span>
            {customer.company && <span className={styles.secondary}>{customer.company}</span>}
          </span>
        ),
      }))
    case 'articles':
      return (items as ArticleSummary[]).map((article) => ({
        key: `articles:${article.id}`,
        run: () => go(`/conocimiento/${article.slug}`),
        node: (
          <span className={styles.text}>
            <span className={styles.primary}>{article.title}</span>
            <span className={styles.secondary}>{article.category.name}</span>
          </span>
        ),
      }))
  }
}

/** Texto de la región viva: nada mientras se espera, y luego el total o el motivo de que no haya resultados. */
function announce(
  search: ReturnType<typeof useGlobalSearch>,
  groups: SearchGroupDefinition[],
  pending: boolean,
): string {
  if (!search.term || pending) return ''
  let total = 0
  const failed: string[] = []
  for (const group of groups) {
    const result = search[group.id]
    if (result.status === 'success') total += result.total
    else if (result.status === 'error') failed.push(group.seeAll)
  }
  const found = total === 0 ? 'Sin resultados' : `${total} ${total === 1 ? 'resultado' : 'resultados'}`
  if (failed.length === 0) return found
  return total === 0
    ? `No se pudo buscar en ${failed.join(' ni en ')}.`
    : `${found}. No se pudo buscar en ${failed.join(' ni en ')}.`
}
