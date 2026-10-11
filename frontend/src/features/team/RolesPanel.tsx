import { useId } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Skeleton } from '../../components/ui'
import type { TeamMember } from '../../domain/member'
import { isActiveStaff } from './teamLoad'
import styles from './RolesPanel.module.css'

/**
 * Cuántos administradores y agentes hay y el atajo a los permisos de cada rol. Cuenta solo a quien tiene la
 * membresía activa. Si la lista falla, el enlace sigue ahí: los errores de una parte no tapan las demás.
 */
export function RolesPanel({ team }: { team: UseQueryResult<TeamMember[]> }) {
  const headingId = useId()
  const staff = team.isSuccess ? team.data.filter(isActiveStaff) : []
  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.title}>
        Roles
      </h2>
      {team.isPending && <Skeleton lines={2} label="Cargando los roles…" className={styles.skeleton} />}
      {team.isSuccess && (
        <dl className={styles.counts}>
          <div className={styles.count}>
            <dt>Administradores</dt>
            <dd>{staff.filter((member) => member.role === 'admin').length}</dd>
          </div>
          <div className={styles.count}>
            <dt>Agentes</dt>
            <dd>{staff.filter((member) => member.role === 'agent').length}</dd>
          </div>
        </dl>
      )}
      <Link to="/configuracion/permisos" className={styles.link}>
        Ver permisos por rol
      </Link>
    </section>
  )
}
