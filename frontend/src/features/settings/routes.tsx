import { Navigate } from 'react-router'
import type { FeatureRoutes } from '../../app/router'
import type { RouteHandle } from '../../app/layout/AppShell'
import { FormGhost } from './FormGhost'
import { GeneralSection } from './GeneralSection'
import { OrganizationGhost, OrganizationTab } from './OrganizationTab'
import { PermissionsMatrix } from './PermissionsMatrix'
import { SettingsIndex, SettingsPage } from './SettingsPage'
import { StaffOnly } from './StaffOnly'
import { WorkspacesSection } from './WorkspacesSection'

const crumb = (label: string): { handle: RouteHandle } => ({ handle: { crumb: label } })

/**
 * Configuración: una sección por URL. Empresa y Permisos (Espacio) y Tus espacios (Tu cuenta) son del personal
 * (`StaffOnly`); General, de todos los roles. `/configuracion/perfil` y `/configuracion/apariencia` (que ahora son General) y
 * `/configuracion/roles` redirigen a su sección actual.
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
        { path: 'general', element: <GeneralSection />, ...crumb('General') },
        {
          path: 'espacios',
          element: (
            <StaffOnly fallback={<WorkspacesSection />}>
              <WorkspacesSection />
            </StaffOnly>
          ),
          ...crumb('Tus espacios'),
        },
        { path: 'perfil', element: <Navigate to="/configuracion/general" replace /> },
        { path: 'apariencia', element: <Navigate to="/configuracion/general" replace /> },
        { path: 'roles', element: <Navigate to="/configuracion/permisos" replace /> },
      ],
    },
  ],
})
