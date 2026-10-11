import { expect } from '@playwright/test'
import type { SweepRoute } from './types'

export const appSweepRoutes: SweepRoute[] = [
  {
    path: '/',
    // El saludo sale al instante: se mide con los datos de cada bloque, no con los esqueletos.
    ready: async (page) => {
      await expect(page.getByRole('list', { name: 'Tickets que necesitan atención' })).toBeVisible()
      await expect(page.getByRole('img', { name: 'Solicitudes por día' })).toBeVisible()
      await expect(page.getByRole('region', { name: /Borradores sin publicar/ })).toContainText('Ver el borrador')
    },
  },
]
