import { expect } from '@playwright/test'
import type { SweepRoute } from './types'

// Cada sección se mide con su contenido, no con el esqueleto que llega antes.
export const settingsSweepRoutes: SweepRoute[] = [
  {
    path: '/configuracion/empresa',
    ready: (page) => expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toBeVisible(),
  },
  {
    path: '/configuracion/general',
    ready: (page) => expect(page.getByRole('radio', { name: 'Claro' })).toBeVisible(),
  },
  {
    path: '/configuracion/espacios',
    ready: (page) => expect(page.getByRole('heading', { level: 2, name: 'Tus espacios' })).toBeVisible(),
  },
  {
    // Tabla con ancho para ella y selector de rol sin él: las dos formas se miden.
    path: '/configuracion/permisos',
    ready: (page) => expect(page.getByRole('table').or(page.getByRole('group', { name: 'Rol' }))).toBeVisible(),
  },
]
