import { Button, EmptyState } from '../../components/ui'
import type { OrganizationSettings } from '../../api/schema'
import { useMe } from '../session/queries'
import { useTicketMetrics } from '../tickets/queries'
import { FormGhost } from './FormGhost'
import { OrganizationFacts, OrganizationForm } from './OrganizationForm'
import { useOrganizationSettings } from './queries'

/** Ajustes para mantener el sitio mientras llegan: la zona de `/me` es la que el selector necesita para existir. */
const placeholder = (timeZone: string): OrganizationSettings => ({
  id: '',
  name: '',
  supportEmail: null,
  timeZone,
  firstResponseTargetMinutes: 30,
  version: 0,
})

/** Esqueleto de la sección mientras `/me` no dice el rol: el sitio del formulario del administrador, que es el más alto. */
export function OrganizationGhost() {
  return (
    <FormGhost label="Cargando los ajustes de la empresa…">
      <OrganizationForm settings={placeholder('UTC')} />
    </FormGhost>
  )
}

/**
 * Sección «Empresa»: el administrador edita; el agente ve los mismos valores en lectura, sin controles que no puede
 * usar. Solo se monta dentro de `StaffOnly`, así que las consultas (403 para un cliente) nunca salen para un rol sin
 * acceso. La mediana real de primera respuesta viene de las métricas de tickets: si no llega, el formulario sigue.
 */
export function OrganizationTab() {
  const me = useMe()
  const settings = useOrganizationSettings(true)
  const metrics = useTicketMetrics()
  const isAdmin = me.data?.role === 'admin'
  const responseMinutes = metrics.data ? metrics.data.firstResponseMinutes : undefined

  if (settings.isPending) {
    const ghost = placeholder(me.data?.organization.timeZone ?? 'UTC')
    return (
      <FormGhost label="Cargando los ajustes de la empresa…">
        {isAdmin ? <OrganizationForm settings={ghost} /> : <OrganizationFacts settings={ghost} />}
      </FormGhost>
    )
  }
  if (settings.isError) {
    return (
      <EmptyState
        kind="error"
        title="No pudimos cargar los ajustes de la empresa"
        description="Revisa tu conexión e inténtalo de nuevo."
        headingLevel={2}
        action={
          <Button
            variant="secondary"
            aria-label="Reintentar cargar los ajustes"
            onClick={() => void settings.refetch()}
          >
            Reintentar
          </Button>
        }
      />
    )
  }
  return isAdmin ? (
    <OrganizationForm settings={settings.data} responseMinutes={responseMinutes} />
  ) : (
    <OrganizationFacts settings={settings.data} responseMinutes={responseMinutes} />
  )
}
