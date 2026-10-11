import {
  Avatar,
  Badge,
  IconButton,
  Menu,
  Table,
  TableCell,
  TableHeaderCell,
  TableRow,
  type BadgeTone,
  type MenuItem,
} from '../../components/ui'
import { memberStatusLabel, openCount, urgentCount } from './teamCopy'
import type { MemberStatus, TeamMember } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import styles from './TeamTable.module.css'

export interface TeamTableProps {
  members: TeamMember[]
  /** Texto visible bajo la tabla, p. ej. «Mostrando 5 miembros». */
  caption: string
  /** Deja la leyenda para lectores de pantalla cuando una paginación debajo ya muestra el recuento. */
  captionHidden?: boolean
  /** Acciones de cada fila; el menú solo se dibuja si el arreglo no está vacío. */
  actions?: (member: TeamMember) => MenuItem[]
}

const statusTones: Record<MemberStatus, BadgeTone> = { invited: 'amber', active: 'green', removed: 'neutral' }

/**
 * Tabla del equipo sobre `Table`: tarjetas en contenedores estrechos (< 560 px), agente, estado y carga hasta la tabla
 * completa (el rol bajo el nombre hasta entonces).
 */
export function TeamTable({ members, caption, captionHidden, actions }: TeamTableProps) {
  return (
    <Table
      label="Equipo"
      caption={caption}
      captionHidden={captionHidden}
      actionsLabel="Acción"
      className={styles.table}
      header={
        <>
          <TableHeaderCell area="name">Agente</TableHeaderCell>
          <TableHeaderCell area="role" className={styles.headerRole}>
            Rol
          </TableHeaderCell>
          <TableHeaderCell area="status">Estado</TableHeaderCell>
          <TableHeaderCell area="load">Carga</TableHeaderCell>
        </>
      }
    >
      {members.map((member) => (
        <MemberRow key={member.id} member={member} actions={actions?.(member) ?? []} />
      ))}
    </Table>
  )
}

function MemberRow({ member, actions }: { member: TeamMember; actions: MenuItem[] }) {
  return (
    <TableRow>
      <TableCell kind="name" className={styles.name}>
        <Avatar name={member.name} decorative />
        <span className={styles.identity}>
          <span className={styles.nameText} title={member.name}>
            {member.name}
          </span>
          <span className={styles.email} title={member.email}>
            {member.email}
          </span>
        </span>
      </TableCell>
      <span role="cell" className={styles.role}>
        {roleLabels[member.role]}
      </span>
      <span role="none" className={styles.chips}>
        <span role="cell" className={styles.status}>
          <Badge tone={statusTones[member.status]}>{memberStatusLabel(member)}</Badge>
        </span>
        <span role="cell" className={styles.load}>
          {openCount(member.openTickets)}
          {member.urgentOpenTickets > 0 && (
            <span className={styles.urgent}>{urgentCount(member.urgentOpenTickets)}</span>
          )}
        </span>
      </span>
      <TableCell kind="actions">
        {actions.length > 0 && (
          <Menu label={`Acciones de ${member.name}`} items={actions}>
            {(trigger) => <IconButton icon="more" label={`Acciones de ${member.name}`} {...trigger} />}
          </Menu>
        )}
      </TableCell>
    </TableRow>
  )
}
