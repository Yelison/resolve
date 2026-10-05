import { Button, EmptyState } from '../../components/ui'
import type { OrganizationSettings } from '../../api/schema'
import { useMe } from '../session/queries'
import { FormGhost } from './FormGhost'
import { OrganizationFacts, OrganizationForm } from './OrganizationForm'
import { SettingsSection } from './SettingsSection'
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

/** Esqueleto de la pestaña mientras `/me` no dice el rol: el sitio del formulario del administrador, que es el más alto. */
export function OrganizationGhost() {
  return (
    <SettingsSection title="Empresa">
      <FormGhost label="Cargando los ajustes de la empresa…">
        <OrganizationForm settings={placeholder('UTC')} />
      </FormGhost>
    </SettingsSection>
  )
}

/**
 * Pestaña «Empresa»: el administrador edita; el agente ve los mismos valores en lectura, sin controles que no puede
 * usar. Solo se monta dentro de `StaffOnly`, así que la consulta (403 para un cliente) nunca sale para un rol sin acceso.
 */
export function OrganizationTab() {
  const me = useMe()
  const settings = useOrganizationSettings(true)
  const isAdmin = me.data?.role === 'admin'

  return (
    <SettingsSection
      title="Empresa"
      description={
        isAdmin
          ? 'Datos del espacio de trabajo y la referencia de las métricas.'
          : 'Datos del espacio de trabajo. Solo un administrador puede cambiarlos.'
      }
    >
      {settings.isPending ? (
        <FormGhost label="Cargando los ajustes de la empresa…">
          {isAdmin ? (
            <OrganizationForm settings={placeholder(me.data?.organization.timeZone ?? 'UTC')} />
          ) : (
            <OrganizationFacts settings={placeholder(me.data?.organization.timeZone ?? 'UTC')} />
          )}
        </FormGhost>
      ) : settings.isError ? (
        <EmptyState
          kind="error"
          title="No pudimos cargar los ajustes de la empresa"
          description="Revisa tu conexión e inténtalo de nuevo."
          headingLevel={3}
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
      ) : isAdmin ? (
        <OrganizationForm settings={settings.data} />
      ) : (
        <OrganizationFacts settings={settings.data} />
      )}
    </SettingsSection>
  )
}
