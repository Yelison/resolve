import type { FeatureRoutes } from '../../app/router'
import { ReportsPage } from './ReportsPage'

/** Reportes: una sola vista; el periodo viaja en la query. */
export const reportsRoutes: FeatureRoutes = () => ({ element: <ReportsPage /> })
