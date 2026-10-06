import { useState } from 'react'
import { readCsrfToken } from '../../api/client'
import type { Me } from '../../api/schema'
import { Menu, Tooltip, type MenuItem } from '../../components/ui'
import type { SidebarProfile } from '../../components/ui/Sidebar/Sidebar'
import { DemoUserSwitcher } from './DemoUserSwitcher'
import { OrganizationSwitcher } from './OrganizationSwitcher'
import { useSessionActions } from './useSessionActions'

export interface AccountMenuProps {
  me: Me
  /** Caja del perfil del `Sidebar` (`profileMenu`): contenido y clase del botón que abre el menú. */
  profile: SidebarProfile
}

/**
 * Menú de la cuenta, en el perfil del `Sidebar` (expandido, colapsado o en el drawer móvil): cambiar de organización (si hay varias), cerrar sesión, o, solo en desarrollo y
 * sin sesión OIDC (no hay cookie `XSRF-TOKEN`: la operación /logout no existe), el selector de usuario de demostración.
 */
export function AccountMenu({ me, profile }: AccountMenuProps) {
  const [dialog, setDialog] = useState<'organization' | 'demo' | null>(null)
  const closeDialog = () => setDialog(null)

  // La condición va escrita aquí (ver `api/client.ts`): así el build de producción elimina el selector entero.
  const demoLogin = import.meta.env.DEV || import.meta.env.MODE === 'smoke' || import.meta.env.MODE === 'showcase'
  // En desarrollo, un 403 o 404 de /logout (backend sin oidc, o una cookie XSRF-TOKEN ajena en localhost) lleva al selector.
  const { signOut } = useSessionActions({ onLogoutUnavailable: demoLogin ? () => setDialog('demo') : undefined })
  const demoSession = demoLogin && readCsrfToken() === null
  const organizations = me.organizations ?? []

  const items: MenuItem[] = []
  if (organizations.length > 1) {
    items.push({
      id: 'organization',
      label: `Cambiar de organización · ${me.organization.name}`,
      onSelect: () => setDialog('organization'),
    })
  }
  if (demoSession) {
    items.push({ id: 'demo-user', label: 'Cambiar usuario de demostración', onSelect: () => setDialog('demo') })
  } else {
    items.push({
      id: 'sign-out',
      label: signOut.isPending ? 'Cerrando sesión…' : 'Cerrar sesión',
      tone: 'danger',
      disabled: signOut.isPending,
      onSelect: () => signOut.mutate(),
    })
  }

  return (
    <>
      {/* El menú se abre hacia arriba: el perfil está al pie del sidebar y `Menu` lo voltea si no cabe debajo. */}
      <Menu label="Cuenta" items={items} placement="bottom-start">
        {(menu) => (
          // Colapsado solo se ve el avatar: el nombre va en un tooltip, que se aparta mientras el menú está abierto.
          <Tooltip content={me.user.name} describe={false} disabled={!profile.collapsed || menu['aria-expanded']}>
            {(tooltip) => (
              <button
                type="button"
                className={profile.className}
                aria-label={`Cuenta: ${me.user.name}, ${me.organization.name}`}
                {...menu}
                {...tooltip}
                ref={(node) => {
                  menu.ref(node)
                  tooltip.ref(node)
                }}
              >
                {profile.content}
              </button>
            )}
          </Tooltip>
        )}
      </Menu>
      {dialog === 'organization' && <OrganizationSwitcher me={me} onClose={closeDialog} />}
      {demoLogin && dialog === 'demo' && <DemoUserSwitcher onClose={closeDialog} />}
    </>
  )
}

/**
 * Lo que ocupa el lugar del menú mientras la sesión carga: el mismo perfil en una caja del mismo tamaño que el botón,
 * sin acciones (sin sesión no se sabe qué ofrecer). Así el sidebar no cambia de altura al llegar `/me`.
 */
export function AccountMenuPlaceholder({ profile }: { profile: SidebarProfile }) {
  return <div className={profile.className}>{profile.content}</div>
}
