import type { ReactElement, ReactNode } from 'react'
import { Navigate } from 'react-router'
import { EmptyState, Skeleton } from '../../components/ui'
import type { Role } from '../../api/schema'
import { useMe } from '../../features/session/queries'
import pageStyles from './Page.module.css'

/**
 * Protege una sección según el rol de la sesión: esqueleto mientras carga `/me`, aviso de sin acceso si el rol no está
 * en `roles` y el contenido en otro caso. Si `/me` falla, el shell ya muestra su propio aviso y no renderiza las rutas.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }): ReactElement {
  const me = useMe()
  if (me.isPending) return <Skeleton lines={3} label="Cargando…" />
  if (!me.data || !roles.includes(me.data.role)) {
    return (
      <div className={pageStyles.page}>
        <EmptyState
          kind="restricted"
          title="No tienes acceso a esta sección"
          description="Tu rol no permite abrir esta página."
        />
      </div>
    )
  }
  return <>{children}</>
}

/** Índice de la aplicación: los clientes aterrizan en sus tickets; el personal ve `fallback`. */
export function IndexRedirect({ fallback }: { fallback: ReactElement }): ReactElement {
  const me = useMe()
  if (me.isPending) return <Skeleton lines={3} label="Cargando…" />
  if (me.data?.role === 'customer') return <Navigate to="/tickets" replace />
  return fallback
}
