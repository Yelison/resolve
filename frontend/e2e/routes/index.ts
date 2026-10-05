import { appSweepRoutes } from './app'
import { customersSweepRoutes } from './customers'
import { knowledgeSweepRoutes } from './knowledge'
import { reportsSweepRoutes } from './reports'
import { teamSweepRoutes } from './team'
import { ticketsSweepRoutes } from './tickets'
import type { SweepRoute } from './types'

/** Rutas del barrido responsive. Una feature nueva añade su módulo en esta carpeta y lo reúne aquí. */
export const sweepRoutes: SweepRoute[] = [
  ...appSweepRoutes,
  ...ticketsSweepRoutes,
  ...customersSweepRoutes,
  ...teamSweepRoutes,
  ...knowledgeSweepRoutes,
  ...reportsSweepRoutes,
]
