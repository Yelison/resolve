import { expect } from '@playwright/test'
import type { SweepRoute } from './types'

// Cada pestaña se mide con su contenido, no con el esqueleto que llega antes.
export const settingsSweepRoutes: SweepRoute[] = [
  {
    path: '/configuracion/empresa',
    ready: (page) => expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toBeVisible(),
  },
  {
    path: '/configuracion/perfil',
    ready: (page) => expect(page.getByRole('textbox', { name: 'Nombre' })).toBeVisible(),
  },
  {
    path: '/configuracion/apariencia',
    ready: (page) => expect(page.getByRole('radio', { name: 'Claro' })).toBeVisible(),
  },
  { path: '/configuracion/permisos', ready: (page) => expect(page.getByRole('table')).toBeVisible() },
]
