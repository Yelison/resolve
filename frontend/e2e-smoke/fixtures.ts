import type { Page } from '@playwright/test'

/**
 * Usuarios sembrados por las migraciones de demostración del backend (db/demo, perfil `dev`). El smoke corre contra
 * esa API real, así que estos correos tienen que existir allí.
 */
export const demoUsers = {
  admin: 'yelisson.ortiz@acme.example',
  customer: 'maria.perez@cliente.example',
} as const

/**
 * Clave de almacenamiento del usuario de demostración. Se repite aquí en vez de importarla de `src/api/client.ts`:
 * ese módulo toca `window` al cargarse y no puede importarse desde Node.
 */
const DEMO_USER_STORAGE_KEY = 'resolve-demo-user'

/** Entra como ese usuario: la clave existe antes de que la aplicación haga su primera petición. */
export async function loginAs(page: Page, email: string) {
  await page.addInitScript(([key, value]) => window.localStorage.setItem(key, value), [
    DEMO_USER_STORAGE_KEY,
    email,
  ] as const)
}
