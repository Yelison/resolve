import { useState, type ReactNode } from 'react'
import { readCsrfToken } from '../../api/client'
import type { Me } from '../../api/schema'
import { Menu, type MenuItem } from '../../components/ui'
import { DemoUserSwitcher } from './DemoUserSwitcher'
import { OrganizationSwitcher } from './OrganizationSwitcher'
import styles from './session.module.css'
import { useSessionActions } from './useSessionActions'

export interface AccountMenuProps {
  me: Me
  /** Avatar del `Topbar` (`userMenu`), que hace de contenido del botón. */
  avatar: ReactNode
}

/**
 * Menú de la cuenta en el `Topbar`: cambiar de organización (si hay varias), cerrar sesión, o, solo en desarrollo y
 * sin sesión OIDC (no hay cookie `XSRF-TOKEN`: la operación /logout no existe), el selector de usuario de demostración.
 */
export function AccountMenu({ me, avatar }: AccountMenuProps) {
  const { signOut } = useSessionActions()
  const [dialog, setDialog] = useState<'organization' | 'demo' | null>(null)
  const closeDialog = () => setDialog(null)

  // La condición va escrita aquí (ver `api/client.ts`): así el build de producción elimina el selector entero.
  const demoLogin = import.meta.env.DEV || import.meta.env.MODE === 'smoke'
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
      <Menu label="Cuenta" items={items}>
        {(trigger) => (
          <button
            type="button"
            className={styles.account}
            aria-label={`Cuenta: ${me.user.name}, ${me.organization.name}`}
            {...trigger}
          >
            {avatar}
          </button>
        )}
      </Menu>
      {dialog === 'organization' && <OrganizationSwitcher me={me} onClose={closeDialog} />}
      {demoLogin && dialog === 'demo' && <DemoUserSwitcher onClose={closeDialog} />}
    </>
  )
}

/**
 * Lo que ocupa el lugar del menú mientras la sesión carga: el mismo avatar en un hueco del mismo tamaño que el botón,
 * sin acciones (sin sesión no se sabe qué ofrecer). Así los iconos de la barra no se mueven al llegar `/me`.
 */
export function AccountMenuPlaceholder({ avatar }: { avatar: ReactNode }) {
  return <span className={styles.account}>{avatar}</span>
}
