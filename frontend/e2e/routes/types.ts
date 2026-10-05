import type { Page } from '@playwright/test'

/**
 * Una ruta que el barrido de `responsive.spec.ts` mide en todos los anchos y temas. `ready` espera a lo que el título
 * no garantiza (p. ej. los datos que llegan después del esqueleto) antes de medir.
 */
export interface SweepRoute {
  path: string
  ready?: (page: Page) => Promise<void>
}
