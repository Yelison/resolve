import { useId } from 'react'
import { Avatar, Badge, IconButton, Menu, type BadgeTone, type MenuItem } from '../../components/ui'
import { memberStatusLabels, type MemberStatus, type TeamMember } from '../../domain/member'
import { roleLabels } from '../../app/navigation'
import styles from './TeamTable.module.css'

export interface TeamTableProps {
  members: TeamMember[]
  /** Texto visible bajo la tabla, p. ej. «Mostrando 5 miembros». */
  caption: string
  /** Acciones de cada fila; el menú solo se dibuja si el arreglo no está vacío. */
  actions?: (member: TeamMember) => MenuItem[]
}

const statusTones: Record<MemberStatus, BadgeTone> = { invited: 'amber', active: 'green', removed: 'neutral' }

/**
 * Tabla del equipo con semántica ARIA de tabla en cualquier ancho: tarjetas en contenedores estrechos (< 560 px),
 * agente, estado y carga hasta 960 px (el rol bajo el nombre) y todas las columnas por encima.
 */
export function TeamTable({ members, caption, actions }: TeamTableProps) {
  const captionId = useId()
  return (
    <div className={styles.wrapper}>
      <div role="table" aria-label="Equipo" aria-describedby={captionId} className={styles.table}>
        <div role="rowgroup">
          <div role="row" className={styles.header}>
            <span role="columnheader" className={styles.headerName}>
              Agente
            </span>
            <span role="columnheader" className={styles.headerRole}>
              Rol
            </span>
            <span role="columnheader" className={styles.headerStatus}>
              Estado
            </span>
            <span role="columnheader" className={styles.headerLoad}>
              Carga
            </span>
            <span role="columnheader" className={styles.headerActions}>
              <span className="visually-hidden">Acción</span>
            </span>
          </div>
        </div>
        <div role="rowgroup" className={styles.rows}>
          {members.map((member) => (
            <MemberRow key={member.id} member={member} actions={actions?.(member) ?? []} />
          ))}
        </div>
      </div>
      <p id={captionId} className={styles.caption}>
        {caption}
      </p>
    </div>
  )
}

function MemberRow({ member, actions }: { member: TeamMember; actions: MenuItem[] }) {
  return (
    <div role="row" className={styles.row}>
      <span role="cell" className={styles.name}>
        <Avatar name={member.name} decorative />
        <span className={styles.identity}>
          <span className={styles.nameText} title={member.name}>
            {member.name}
          </span>
          <span className={styles.email} title={member.email}>
            {member.email}
          </span>
        </span>
      </span>
      <span role="cell" className={styles.role}>
        {roleLabels[member.role]}
      </span>
      <span role="none" className={styles.chips}>
        <span role="cell" className={styles.status}>
          <Badge tone={statusTones[member.status]}>{memberStatusLabels[member.status]}</Badge>
        </span>
        <span role="cell" className={styles.load}>
          {member.openTickets === 1 ? '1 abierto' : `${member.openTickets} abiertos`}
        </span>
      </span>
      <span role="cell" className={styles.actions}>
        {actions.length > 0 && (
          <Menu label={`Acciones de ${member.name}`} items={actions}>
            {(trigger) => <IconButton icon="more" label={`Acciones de ${member.name}`} {...trigger} />}
          </Menu>
        )}
      </span>
    </div>
  )
}
