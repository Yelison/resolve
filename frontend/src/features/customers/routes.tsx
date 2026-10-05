import type { RouteObject } from 'react-router'
import type { FeatureRoutes } from '../../app/router'
import type { RouteHandle } from '../../app/layout/AppShell'
import { CustomerDetailPage } from './CustomerDetailPage'
import { CustomersPage } from './CustomersPage'
import { NewCustomerDialog } from './NewCustomerDialog'

const children: RouteObject[] = [
  {
    // La lista sigue montada bajo el diálogo de alta (`nuevo`), que se pinta en su `Outlet`.
    element: <CustomersPage />,
    children: [
      { index: true },
      { path: 'nuevo', element: <NewCustomerDialog />, handle: { crumb: 'Nuevo cliente' } satisfies RouteHandle },
    ],
  },
  // El `crumb` recibe solo los parámetros de la ruta, no el cliente cargado: el nombre no está disponible aquí.
  { path: ':id', element: <CustomerDetailPage />, handle: { crumb: 'Detalle del cliente' } satisfies RouteHandle },
]

/** Clientes: lista con el diálogo de alta encima y ficha. */
export const customersRoutes: FeatureRoutes = () => ({ children })
