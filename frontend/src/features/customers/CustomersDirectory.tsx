import { useId } from 'react'
import { Link, type To } from 'react-router'
import { Avatar, Badge } from '../../components/ui'
import type { CustomerSummary } from '../../domain/customer'
import { formatDateTime, formatRelative } from '../../lib/format'
import { companyMark, openTicketsLabel } from './directory'
import styles from './CustomersDirectory.module.css'

/** Una tarjeta del directorio: una empresa, o la lista entera cuando no se agrupa. */
export interface DirectoryCard {
  /** Identifica la tarjeta en la lista. */
  key: string
  /** Cabecera de empresa; `undefined` en la lista sin agrupar. `name` es `null` para quienes no tienen empresa. */
  company?: { name: string | null; summary: string }
  customers: CustomerSummary[]
  /** Con una empresa entera de por medio, cada fila dice cuál es la suya. */
  showCompany?: boolean
  /** Enlace al pie que abre la empresa completa cuando solo se ven sus primeros clientes. */
  more?: { label: string; to: To; onClick?: () => void }
}

export interface CustomersDirectoryProps {
  cards: DirectoryCard[]
  /** Nombre accesible de la lista (la de «Sin agrupar» no tiene cabeceras de empresa que la nombren). */
  label: string
  timeZone?: string
  /** Instante con el que se cuentan los «hace…»; por defecto, ahora. */
  now?: Date
}

/**
 * Directorio de clientes: una tarjeta por empresa y una fila por cliente, con su última conversación y sus tickets
 * abiertos. En pantallas estrechas las filas se apilan en lugar de recortarse, y los nombres largos envuelven.
 */
export function CustomersDirectory({ cards, label, timeZone, now }: CustomersDirectoryProps) {
  return (
    <div className={styles.directory} role="group" aria-label={label}>
      {cards.map((card) => (
        <CompanyCard key={card.key} card={card} timeZone={timeZone} now={now} />
      ))}
    </div>
  )
}

function CompanyCard({ card, timeZone, now }: { card: DirectoryCard; timeZone?: string; now?: Date }) {
  const headingId = useId()
  const { company } = card
  return (
    <section className={styles.card} aria-labelledby={company ? headingId : undefined}>
      {company && (
        <header className={styles.groupHeader}>
          <div className={styles.company}>
            {company.name && <CompanyMark name={company.name} />}
            <h2 id={headingId} className={styles.companyName}>
              {company.name ?? 'Sin empresa'}
            </h2>
          </div>
          <p className={styles.groupSummary}>{company.summary}</p>
        </header>
      )}
      <CustomerRows customers={card.customers} showCompany={card.showCompany} timeZone={timeZone} now={now} />
      {card.more && (
        <Link to={card.more.to} className={styles.more} onClick={card.more.onClick}>
          {card.more.label}
        </Link>
      )}
    </section>
  )
}

/** Marca de la empresa con sus iniciales; la decora, el nombre va al lado. */
function CompanyMark({ name }: { name: string }) {
  return (
    <span className={styles.mark} aria-hidden="true">
      {companyMark(name)}
    </span>
  )
}

interface CustomerRowsProps {
  customers: CustomerSummary[]
  /** Sin cabecera de empresa, la fila nombra la suya. */
  showCompany?: boolean
  timeZone?: string
  now?: Date
}

function CustomerRows({ customers, showCompany = false, timeZone, now }: CustomerRowsProps) {
  return (
    <ul className={styles.rows}>
      {customers.map((customer) => (
        <li key={customer.id} className={styles.row}>
          <Avatar name={customer.name} decorative className={styles.avatar} />
          <div className={styles.person}>
            <Link to={`/clientes/${customer.id}`} className={styles.name}>
              {customer.name}
            </Link>
            <span className={styles.email}>{customer.email}</span>
            {showCompany && <span className={styles.email}>{customer.company ?? 'Sin empresa'}</span>}
          </div>
          <LastConversation customer={customer} timeZone={timeZone} now={now} />
          <Badge tone={customer.openTickets > 0 ? 'blue' : 'neutral'} className={styles.badge}>
            {openTicketsLabel(customer.openTickets)}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function LastConversation({ customer, timeZone, now }: { customer: CustomerSummary; timeZone?: string; now?: Date }) {
  const { lastTicket } = customer
  return (
    <div className={styles.last}>
      <span className={styles.lastLabel}>Última conversación</span>
      {lastTicket ? (
        <span className={styles.lastText}>
          <Link to={`/tickets/${lastTicket.number}`} className={styles.ticketLink}>
            #{lastTicket.number} {lastTicket.subject}
          </Link>
          <time
            className={styles.time}
            dateTime={lastTicket.updatedAt}
            title={formatDateTime(new Date(lastTicket.updatedAt), now, timeZone)}
          >
            {formatRelative(new Date(lastTicket.updatedAt), now, timeZone)}
          </time>
        </span>
      ) : (
        <span className={styles.none}>Sin conversaciones todavía</span>
      )}
    </div>
  )
}

/**
 * Esqueleto con la forma de las tarjetas: usa las mismas clases que el directorio (cabecera de empresa y una fila), de modo
 * que cada tarjeta mide lo que mide una real con un cliente y la página no salta al llegar los datos.
 */
export function CustomersDirectorySkeleton({ label }: { label: string }) {
  return (
    <div className={styles.directory}>
      <p className="visually-hidden" role="status">
        {label}
      </p>
      <div className={styles.directory} aria-hidden="true">
        {[0, 1, 2].map((card) => (
          <section key={card} className={styles.card}>
            <header className={styles.groupHeader}>
              <div className={styles.company}>
                <span className={styles.markPlaceholder} />
                <span className={styles.bar} data-size="title" />
              </div>
              <span className={styles.bar} data-size="summary" />
            </header>
            <ul className={styles.rows}>
              <li className={styles.row}>
                <Avatar name="" decorative className={styles.avatarGhost} />
                <div className={styles.person}>
                  <span className={styles.bar} data-size="name" />
                  <span className={styles.bar} data-size="email" />
                </div>
                <div className={styles.last}>
                  <span className={styles.bar} data-size="label" />
                  <span className={styles.bar} data-size="conversation" />
                </div>
                <span className={styles.bar} data-size="badge" />
              </li>
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
