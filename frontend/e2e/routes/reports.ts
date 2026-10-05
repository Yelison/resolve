import { expect } from '@playwright/test'
import type { SweepRoute } from './types'

// El informe llega después del título: se mide con los datos, no con el esqueleto.
const ready: SweepRoute['ready'] = (page) =>
  expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()

export const reportsSweepRoutes: SweepRoute[] = ['/reportes', '/reportes?period=30d', '/reportes?period=90d'].map(
  (path) => ({ path, ready }),
)
