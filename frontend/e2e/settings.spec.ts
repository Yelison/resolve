import type { Page } from '@playwright/test'
import { expect, mockApi, test } from './fixtures'

const desktop = { width: 1440, height: 900 }

/** El sidebar no es un landmark: se llega a él desde su navegación principal. */
const sidebarOf = (page: Page) => page.getByRole('navigation', { name: 'Principal' }).locator('..')

test.describe('configuración', () => {
  test('/configuracion abre Empresa y las pestañas viven en la URL', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion\/empresa$/)
    await expect(page.getByRole('tab')).toHaveText(['Empresa', 'Perfil', 'Apariencia', 'Permisos'])

    await page.getByRole('tab', { name: 'Permisos' }).click()
    await expect(page).toHaveURL(/\/configuracion\/permisos$/)
    await page.goBack()
    // Cambiar de pestaña reemplaza la entrada: Atrás sale de Configuración en lugar de recorrer las pestañas.
    await expect(page).not.toHaveURL(/\/configuracion/)
  })

  test('con teclado las flechas cambian de pestaña y el foco se queda en ella', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await page.getByRole('tab', { name: 'Empresa' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(/\/configuracion\/perfil$/)
    await expect(page.getByRole('tab', { name: 'Perfil' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(page).toHaveURL(/\/configuracion\/permisos$/)
    await expect(page.getByRole('tab', { name: 'Permisos' })).toBeFocused()
  })

  test('/configuracion/roles redirige a la matriz de permisos', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/roles')
    await expect(page).toHaveURL(/\/configuracion\/permisos$/)
    const table = page.getByRole('table')
    await expect(table.getByRole('columnheader')).toHaveText(['Capacidad', 'Administrador', 'Agente', 'Cliente'])
    await expect(page.getByText(/servidor/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Guardar/ })).toHaveCount(0)
  })

  test('el administrador guarda la empresa: el sidebar cambia y el formulario vuelve a estar limpio', async ({
    page,
  }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    const save = page.getByRole('button', { name: 'Guardar cambios' })
    await expect(save).toBeDisabled()

    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')
    await page.getByRole('combobox', { name: 'Zona horaria' }).selectOption('Europe/Madrid')
    await page.getByRole('textbox', { name: 'Objetivo de primera respuesta' }).fill('45')
    await save.click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await expect(sidebarOf(page).getByText('Acme Studio SL')).toBeVisible()
    await expect(save).toBeDisabled()
    await expect(page.getByRole('heading', { name: 'Empresa', level: 2 })).toBeFocused()

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Zona horaria' })).toHaveValue('Europe/Madrid')
    await expect(page.getByRole('textbox', { name: 'Objetivo de primera respuesta' })).toHaveValue('45')
  })

  test('valida en el cliente y muestra los errores del servidor en su campo', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    const name = page.getByRole('textbox', { name: 'Nombre del espacio' })
    await name.fill('')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Escribe el nombre del espacio.')).toBeVisible()
    await expect(name).toBeFocused()

    await name.fill('Acme Studio')
    const zone = page.getByRole('combobox', { name: 'Zona horaria' })
    await zone.selectOption('Pacific/Honolulu')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Zona horaria no reconocida por el servidor.')).toBeVisible()
    await expect(zone).toHaveAttribute('aria-invalid', 'true')
  })

  test('un 412 conserva lo escrito y reintenta con la versión nueva', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')

    // Otra persona cambia el correo de soporte mientras tanto.
    await page.evaluate(() =>
      fetch('/api/organization', {
        method: 'PATCH',
        headers: { 'If-Match': '"3"', 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify({ supportEmail: 'otra@acme.example' }),
      }),
    )
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Los ajustes cambiaron mientras los editabas')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toHaveValue('Acme Studio SL')
    await expect(page.getByRole('textbox', { name: 'Correo de soporte' })).toHaveValue('otra@acme.example')

    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await expect(sidebarOf(page).getByText('Acme Studio SL')).toBeVisible()
  })

  test('el perfil cambia el nombre en el sidebar', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/perfil')
    await expect(page.getByText('yelisson@acme.example')).toBeVisible()
    await page.getByRole('textbox', { name: 'Nombre' }).fill('Yelisson O. Ortiz')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await expect(sidebarOf(page).getByText('Yelisson O. Ortiz')).toBeVisible()
  })

  test('apariencia: el tema se aplica y se recuerda en este navegador', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/apariencia')
    await expect(page.getByText('Esta preferencia se guarda en este navegador.')).toBeVisible()
    await page.getByRole('radio', { name: 'Oscuro' }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
  })

  test('apariencia y topbar comparten el tema: el primer clic del botón lo cambia', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/apariencia')
    await page.getByRole('radio', { name: 'Oscuro' }).check()
    const toggle = page.getByRole('button', { name: 'Cambiar a tema claro' })
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('radio', { name: 'Claro' })).toBeChecked()
    await expect(page.getByRole('button', { name: 'Cambiar a tema oscuro' })).toBeVisible()
  })

  test('un nombre de espacio de 120 caracteres no desborda la página en móvil', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await page.goto('/configuracion/empresa')
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('N'.repeat(120))
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    await page.getByRole('tab', { name: 'Permisos' }).click()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('mientras se guarda, el botón muestra el progreso y no envía dos veces', async ({ page }) => {
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    let patches = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/organization', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      patches++
      await held
      return route.fallback()
    })
    await page.getByRole('textbox', { name: 'Nombre del espacio' }).fill('Acme Studio SL')
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    const busy = page.getByRole('button', { name: 'Guardando…' })
    await expect(busy).toBeVisible()
    await busy.click({ force: true })
    await page.keyboard.press('Enter')
    release()
    await expect(page.getByText('Cambios guardados')).toBeVisible()
    expect(patches).toBe(1)
  })

  test('sin saltos de layout: el panel no se mueve al llegar los ajustes', async ({ page }) => {
    await page.setViewportSize(desktop)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/organization', async (route) => {
      await held
      return route.fallback()
    })
    await page.goto('/configuracion/empresa')
    await expect(page.getByText('Cargando los ajustes de la empresa…')).toBeAttached()
    const panel = page.getByRole('tabpanel')
    const before = await panel.boundingBox()
    release()
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toBeVisible()
    const after = await panel.boundingBox()
    expect(after!.y).toBe(before!.y)
    expect(after!.height).toBeCloseTo(before!.height, 0)
  })

  test('el agente ve Empresa en solo lectura', async ({ page }) => {
    await mockApi(page, 'agent')
    await page.setViewportSize(desktop)
    await page.goto('/configuracion/empresa')
    await expect(page.getByRole('tab')).toHaveText(['Empresa', 'Perfil', 'Apariencia', 'Permisos'])
    await expect(page.getByText('Acme Studio', { exact: true }).last()).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Nombre del espacio' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  })

  test('el cliente solo ve Perfil y Apariencia y no puede abrir Empresa ni Permisos', async ({ page }) => {
    await mockApi(page, 'customer')
    await page.setViewportSize(desktop)
    await page.goto('/configuracion')
    await expect(page).toHaveURL(/\/configuracion\/perfil$/)
    await expect(page.getByRole('tab')).toHaveText(['Perfil', 'Apariencia'])
    for (const path of ['empresa', 'permisos']) {
      await page.goto(`/configuracion/${path}`)
      await expect(page.getByText('No tienes acceso a esta sección')).toBeVisible()
    }
  })
})
