import { useId } from 'react'
import { Link } from 'react-router'
import { Badge, IconButton, Menu, type MenuItem } from '../../components/ui'
import type { CustomerSummary } from '../../domain/customer'
import { cx } from '../../lib/cx'
import styles from './CustomersTable.module.css'

export interface CustomersTableProps {
  customers: CustomerSummary[]
  /** Texto visible bajo la tabla, p. ej. «Mostrando 5 resultados». */
  caption: string
  /** Acciones de cada fila; el menú solo se dibuja si el arreglo no está vacío. */
  actions?: (customer: CustomerSummary) => MenuItem[]
}

/**
 * Tabla de clientes con semántica ARIA de tabla en cualquier ancho: tarjetas en contenedores estrechos
 * (< 560 px), nombre, empresa, tickets y estado hasta 960 px, y todas las columnas por encima.
 */
export function CustomersTable({ customers, caption, actions }: CustomersTableProps) {
  const captionId = useId()
  return (
    <div className={styles.wrapper}>
      <div role="table" aria-label="Clientes" aria-describedby={captionId} className={styles.table}>
        <div role="rowgroup">
          <div role="row" className={styles.header}>
            <span role="columnheader" className={styles.headerName}>
              Cliente
            </span>
            <span role="columnheader" className={styles.headerCompany}>
              Empresa
            </span>
            <span role="columnheader" className={styles.headerEmail}>
              Correo
            </span>
            <span role="columnheader" className={styles.headerTickets}>
              Tickets
            </span>
            <span role="columnheader" className={styles.headerStatus}>
              Estado
            </span>
            <span role="columnheader" className={styles.headerActions}>
              <span className="visually-hidden">Acciones</span>
            </span>
          </div>
        </div>
        <div role="rowgroup" className={styles.rows}>
          {customers.map((customer) => (
            <CustomerRow key={customer.id} customer={customer} actions={actions?.(customer) ?? []} />
          ))}
        </div>
      </div>
      <p id={captionId} className={styles.caption}>
        {caption}
      </p>
    </div>
  )
}

function CustomerRow({ customer, actions }: { customer: CustomerSummary; actions: MenuItem[] }) {
  return (
    <div role="row" className={styles.row}>
      <span role="cell" className={styles.name}>
        <Link to={`/clientes/${customer.id}`} className={styles.nameLink} title={customer.name}>
          {customer.name}
        </Link>
      </span>
      <span role="none" className={styles.meta}>
        <span role="cell" className={cx(styles.company, !customer.company && styles.none)}>
          {customer.company ?? (
            <>
              <span aria-hidden="true">—</span>
              <span className="visually-hidden">Sin empresa</span>
            </>
          )}
        </span>
        <span role="cell" className={styles.email} title={customer.email}>
          {customer.email}
        </span>
      </span>
      <span role="none" className={styles.chips}>
        <span role="cell" className={styles.tickets}>
          {customer.openTickets === 1 ? '1 abierto' : `${customer.openTickets} abiertos`}
          <span className="visually-hidden">, {customer.totalTickets} en total</span>
        </span>
        <span role="cell" className={styles.status}>
          <Badge tone={customer.archived ? 'neutral' : 'green'}>{customer.archived ? 'Archivado' : 'Activo'}</Badge>
        </span>
      </span>
      <span role="cell" className={styles.actions}>
        {actions.length > 0 && (
          <Menu label={`Acciones de ${customer.name}`} items={actions}>
            {(trigger) => <IconButton icon="more" label={`Acciones de ${customer.name}`} {...trigger} />}
          </Menu>
        )}
      </span>
    </div>
  )
}
