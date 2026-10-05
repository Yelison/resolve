import type { SweepRoute } from './types'

const article = '/conocimiento/como-recuperar-el-acceso-a-tu-cuenta'

export const knowledgeSweepRoutes: SweepRoute[] = [
  { path: '/conocimiento' },
  { path: article },
  { path: `${article}/editar` },
  { path: '/conocimiento/nuevo' },
]
