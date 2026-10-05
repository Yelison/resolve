import { Link } from 'react-router'
import {
  Badge,
  IconButton,
  Menu,
  Table,
  TableCell,
  TableHeaderCell,
  TableRow,
  type MenuItem,
} from '../../components/ui'
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
 * Tabla de clientes sobre `Table`: tarjetas en contenedores estrechos (< 560 px), nombre, empresa, tickets y estado
 * hasta la tabla completa, que añade el correo.
 */
export function CustomersTable({ customers, caption, actions }: CustomersTableProps) {
  return (
    <Table
      label="Clientes"
      caption={caption}
      actionsLabel="Acciones"
      className={styles.table}
      header={
        <>
          <TableHeaderCell area="name">Cliente</TableHeaderCell>
          <TableHeaderCell area="company">Empresa</TableHeaderCell>
          <TableHeaderCell area="email" className={styles.headerEmail}>
            Correo
          </TableHeaderCell>
          <TableHeaderCell area="tickets">Tickets</TableHeaderCell>
          <TableHeaderCell area="status">Estado</TableHeaderCell>
        </>
      }
    >
      {customers.map((customer) => (
        <CustomerRow key={customer.id} customer={customer} actions={actions?.(customer) ?? []} />
      ))}
    </Table>
  )
}

function CustomerRow({ customer, actions }: { customer: CustomerSummary; actions: MenuItem[] }) {
  return (
    <TableRow>
      <TableCell kind="name">
        <Link to={`/clientes/${customer.id}`} className={styles.nameLink} title={customer.name}>
          {customer.name}
        </Link>
      </TableCell>
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
      <TableCell kind="actions">
        {actions.length > 0 && (
          <Menu label={`Acciones de ${customer.name}`} items={actions}>
            {(trigger) => <IconButton icon="more" label={`Acciones de ${customer.name}`} {...trigger} />}
          </Menu>
        )}
      </TableCell>
    </TableRow>
  )
}
