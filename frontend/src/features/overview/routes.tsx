import type { FeatureRoutes } from '../../app/router'
import { OverviewPage } from './OverviewPage'

/** Inicio: una sola vista, sin rutas hijas. */
export const overviewRoutes: FeatureRoutes = () => ({ element: <OverviewPage /> })
