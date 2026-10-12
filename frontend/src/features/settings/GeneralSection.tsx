import { Button, EmptyState } from '../../components/ui'
import type { Me } from '../../api/schema'
import { useMe } from '../session/queries'
import { FormGhost } from './FormGhost'
import { ProfileForm } from './ProfileForm'
import { ThemeBlock } from './ThemeBlock'
import styles from './forms.module.css'

const placeholder: Me = {
  user: { id: '', name: '', email: '' },
  organization: { id: '', name: '', timeZone: 'UTC', color: 'blue', supportEmail: null, demo: false },
  organizationCreation: { allowed: false, created: 0, limit: 3 },
  role: 'agent',
  customerId: null,
}

/**
 * Sección «General» (Tu cuenta), para todos los roles: cómo te ve tu equipo, los datos de acceso y, después de la
 * barra de guardar, el tema, que se aplica al momento y no la usa. `/me` ya está cargada en el shell; el esqueleto
 * cubre solo la carga en frío. Si `/me` falla, el tema sigue disponible: es una preferencia de este navegador.
 */
export function GeneralSection() {
  const me = useMe()
  return (
    <div className={styles.form}>
      {me.data ? (
        <ProfileForm me={me.data} />
      ) : me.isError ? (
        <EmptyState
          kind="error"
          title="No pudimos cargar tu perfil"
          headingLevel={2}
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
      <ThemeBlock />
    </div>
  )
}
