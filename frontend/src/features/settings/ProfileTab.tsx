import { useMe } from '../session/queries'
import { Button, EmptyState } from '../../components/ui'
import type { Me } from '../../api/schema'
import { FormGhost } from './FormGhost'
import { ProfileForm } from './ProfileForm'
import { SettingsSection } from './SettingsSection'

const placeholder: Me = {
  user: { id: '', name: '', email: '' },
  organization: { id: '', name: '', timeZone: 'UTC', supportEmail: null, demo: false },
  role: 'agent',
  customerId: null,
}

/** Pestaña «Perfil». `/me` ya está cargada en el shell; el esqueleto cubre solo la carga en frío. */
export function ProfileTab() {
  const me = useMe()
  return (
    <SettingsSection title="Perfil" description="Cómo apareces para tu equipo en este espacio.">
      {me.data ? (
        <ProfileForm me={me.data} />
      ) : me.isError ? (
        <EmptyState
          kind="error"
          title="No pudimos cargar tu perfil"
          headingLevel={3}
          action={
            <Button variant="secondary" aria-label="Reintentar cargar tu perfil" onClick={() => void me.refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : (
        <FormGhost label="Cargando tu perfil…">
          <ProfileForm me={placeholder} />
        </FormGhost>
      )}
    </SettingsSection>
  )
}
