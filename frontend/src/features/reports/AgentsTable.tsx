import { Avatar, Badge, Table, TableCell, TableHeaderCell, TableRow, type BadgeTone } from '../../components/ui'
import type { MemberStatus, ReportAgent } from '../../api/schema'
import { agentStatusLabel, formatMinutes, integer } from './reportData'
import styles from './AgentsTable.module.css'

export interface AgentsTableProps {
  agents: ReportAgent[]
  /** Texto visible bajo la tabla, p. ej. «Mostrando 3 agentes». */
  caption: string
}

const statusTones: Record<Exclude<MemberStatus, 'active'>, BadgeTone> = { invited: 'amber', removed: 'neutral' }

/**
 * Agentes del informe sobre `Table`: tarjetas en contenedores estrechos (< 560 px) y las cuatro columnas por encima.
 * Quien ya no está en el equipo activo (retirado o con una invitación nueva) lleva su estado junto al nombre.
 */
export function AgentsTable({ agents, caption }: AgentsTableProps) {
  return (
    <Table
      label="Rendimiento por agente"
      caption={caption}
      actionsLabel="Sin acciones"
      className={styles.table}
      header={
        <>
          <TableHeaderCell area="name">Agente</TableHeaderCell>
          <TableHeaderCell area="resolved">Resueltos</TableHeaderCell>
          <TableHeaderCell area="response">Primera respuesta</TableHeaderCell>
          <TableHeaderCell area="open">Asignados abiertos</TableHeaderCell>
        </>
      }
    >
      {agents.map((agent) => (
        <AgentRow key={agent.member.id} agent={agent} />
      ))}
    </Table>
  )
}

function AgentRow({ agent }: { agent: ReportAgent }) {
  const status = agentStatusLabel(agent)
  return (
    <TableRow>
      <TableCell kind="name" className={styles.name}>
        <Avatar name={agent.member.name} decorative />
        <span className={styles.identity}>
          <span className={styles.nameText}>{agent.member.name}</span>
          {status && agent.status !== 'active' && <Badge tone={statusTones[agent.status]}>{status}</Badge>}
        </span>
      </TableCell>
      <span role="none" className={styles.chips}>
        <span role="cell" className={styles.resolved}>
          <span className={styles.cellLabel} aria-hidden="true">
            Resueltos
          </span>
          {integer.format(agent.resolved)}
        </span>
        <span role="cell" className={styles.response}>
          <span className={styles.cellLabel} aria-hidden="true">
            Primera respuesta
          </span>
          {formatMinutes(agent.firstResponseMinutes)}
        </span>
        <span role="cell" className={styles.open}>
          <span className={styles.cellLabel} aria-hidden="true">
            Asignados abiertos
          </span>
          {integer.format(agent.openAssigned)}
        </span>
      </span>
      {/* Sin acciones: la celda existe solo para que cada fila tenga tantas celdas como columnas la cabecera. */}
      <TableCell kind="actions">{null}</TableCell>
    </TableRow>
  )
}
