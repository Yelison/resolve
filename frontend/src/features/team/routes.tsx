import type { FeatureRoutes } from '../../app/router'
import { TeamPage } from './TeamPage'

/** Equipo: una sola vista; los diálogos se abren desde ella. */
export const teamRoutes: FeatureRoutes = () => ({ element: <TeamPage /> })
