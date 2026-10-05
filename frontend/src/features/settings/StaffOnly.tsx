import type { ReactNode } from 'react'
import { EmptyState } from '../../components/ui'
import { useMe } from '../session/queries'

/**
 * Guardia de las pestañas del personal (Empresa y Permisos). La sección entera la abren todos los roles, así que la
 * guardia de la ruta no basta: aquí se decide por rol. Mientras `/me` carga se muestra `fallback` (el esqueleto de la
 * pestaña) y nunca el contenido; un cliente que llega por URL ve el aviso de sin acceso, como en el resto de secciones.
 */
export function StaffOnly({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  const me = useMe()
  if (me.isPending) return <>{fallback}</>
  if (me.data?.role === 'customer' || !me.data) {
    return (
      <EmptyState
        kind="restricted"
        title="No tienes acceso a esta sección"
        description="Tu rol no permite abrir esta pestaña."
      />
    )
  }
  return <>{children}</>
}
