import { useId } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router'
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
      {team.isError ? (
        <p className={styles.error} role="status">
          No pudimos cargar los roles. Puedes reintentar desde la lista de miembros.
        </p>
      ) : (
        // Mientras carga se reserva el `dl` real (oculto): mide lo mismo con cifras y sin ellas.
        <>
          {team.isPending && (
            <span className="visually-hidden" role="status">
              Cargando los roles…
            </span>
          )}
          <dl className={team.isPending ? `${styles.counts} ${styles.pending}` : styles.counts}>
            <div className={styles.count}>
              <dt>Administradores</dt>
              <dd>{staff.filter((member) => member.role === 'admin').length}</dd>
            </div>
            <div className={styles.count}>
              <dt>Agentes</dt>
              <dd>{staff.filter((member) => member.role === 'agent').length}</dd>
            </div>
          </dl>
        </>
      )}
      <Link to="/configuracion/permisos" className={styles.link}>
        Ver permisos por rol
      </Link>
    </section>
  )
}
