import { Navigate } from 'react-router'
import type { FeatureRoutes } from '../../app/router'
import type { RouteHandle } from '../../app/layout/AppShell'
import { AppearanceTab } from './AppearanceTab'
import { FormGhost } from './FormGhost'
import { OrganizationGhost, OrganizationTab } from './OrganizationTab'
import { PermissionsMatrix } from './PermissionsMatrix'
import { ProfileTab } from './ProfileTab'
import { SettingsIndex, SettingsPage } from './SettingsPage'
import { StaffOnly } from './StaffOnly'

const crumb = (label: string): { handle: RouteHandle } => ({ handle: { crumb: label } })

/**
 * Configuración: una página con pestañas en la URL. Empresa y Permisos son del personal (`StaffOnly`); Perfil y
 * Apariencia, de todos los roles. `/configuracion/roles` redirige a `permisos`.
 */
export const settingsRoutes: FeatureRoutes = () => ({
  children: [
    {
      element: <SettingsPage />,
      children: [
        { index: true, element: <SettingsIndex /> },
        {
          path: 'empresa',
          element: (
            <StaffOnly fallback={<OrganizationGhost />}>
              <OrganizationTab />
            </StaffOnly>
          ),
          ...crumb('Empresa'),
        },
        { path: 'perfil', element: <ProfileTab />, ...crumb('Perfil') },
        { path: 'apariencia', element: <AppearanceTab />, ...crumb('Apariencia') },
        {
          path: 'permisos',
          element: (
            <StaffOnly
              fallback={
                <FormGhost label="Cargando los permisos…">
                  <PermissionsMatrix />
                </FormGhost>
              }
            >
              <PermissionsMatrix />
            </StaffOnly>
          ),
          ...crumb('Permisos'),
        },
        { path: 'roles', element: <Navigate to="/configuracion/permisos" replace /> },
      ],
    },
  ],
})
