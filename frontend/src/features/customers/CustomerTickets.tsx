import { Button, EmptyState, Skeleton, TicketRow, TicketTable } from '../../components/ui'
import { useTimeZone } from '../session/useTimeZone'
import { useTicketList } from '../tickets/queries'
import styles from './CustomerDetailPage.module.css'

const PAGE_SIZE = 20

/** Tickets de un cliente, más recientes primero, con los mismos estados que la bandeja. */
export function CustomerTickets({ customerId, customerName }: { customerId: string; customerName: string }) {
  const timeZone = useTimeZone()
  const tickets = useTicketList({
    view: 'all',
    status: [],
    priority: [],
    customerId,
    page: 1,
    pageSize: PAGE_SIZE,
    sort: 'updatedAt,desc',
  })

  if (tickets.isPending) {
    return (
      <div className={`${styles.tabBody} ${styles.tabsPanelPadded}`}>
        <Skeleton lines={2} label="Cargando tickets…" />
        <Skeleton lines={2} label="" />
      </div>
    )
  }
  if (tickets.isError) {
    return (
      <div className={`${styles.tabBody} ${styles.tabsPanelPadded}`}>
        <EmptyState
          kind="error"
          headingLevel={3}
          title="No pudimos cargar los tickets"
          description="Revisa tu conexión y vuelve a intentarlo."
          action={
            <Button
              variant="secondary"
              aria-label="Reintentar cargar los tickets del cliente"
              onClick={() => void tickets.refetch()}
            >
              Reintentar
            </Button>
          }
        />
      </div>
    )
  }
  const { items, totalItems } = tickets.data
  if (items.length === 0) {
    return (
      <div className={`${styles.tabBody} ${styles.tabsPanelPadded}`}>
        <EmptyState
          icon="ticket"
          headingLevel={3}
          title="Sin tickets todavía"
          description={`${customerName} no ha abierto ningún ticket.`}
        />
      </div>
    )
  }
  return (
    <div className={styles.tabBody}>
      <TicketTable label={`Tickets de ${customerName}`}>
        {items.map((ticket) => (
          <TicketRow
            key={ticket.id}
            ticket={ticket}
            to={`/tickets/${ticket.number}`}
            actions={[]}
            timeZone={timeZone}
          />
        ))}
      </TicketTable>
      {totalItems > items.length && (
        <p className={`${styles.muted} ${styles.tabsPanelPadded}`}>
          Mostrando los {items.length} más recientes de {totalItems}.
        </p>
      )}
    </div>
  )
}
