import type { RouteObject } from 'react-router'
import { LoginPage } from './LoginPage'
import { LOGIN_ROUTE } from './SessionGate'

/** Rutas de sesión fuera de la shell: la pantalla de entrada. Se registran en `appRoutes`. */
export const sessionRoutes: RouteObject[] = [{ path: LOGIN_ROUTE, element: <LoginPage /> }]
