import { expect, test, type Page } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: el objetivo de primera respuesta de Configuración llega al Resumen. Es estado de la
 * organización, compartido con las demás pruebas del smoke, así que se lee el valor actual, se guarda uno distinto
 * (si no, «Guardar cambios» queda deshabilitado) y se restaura al terminar aunque algo falle.
 */
async function saveTarget(page: Page, minutes: number) {
  await page.goto('/configuracion/empresa')
  const field = page.getByRole('textbox', { name: 'Objetivo de primera respuesta' })
  await field.fill(String(minutes))
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()
}

test('cambiar el objetivo de primera respuesta en Configuración se ve en el Resumen', async ({ page }) => {
  test.setTimeout(60_000)
  await loginAs(page, demoUsers.admin)

  await page.goto('/configuracion/empresa')
  const field = page.getByRole('textbox', { name: 'Objetivo de primera respuesta' })
  await expect(field).not.toHaveValue('')
  const original = Number(await field.inputValue())
  const changed = original === 37 ? 41 : 37

  try {
    await test.step('guarda un objetivo distinto del actual', async () => {
      await saveTarget(page, changed)
      await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    })

    await test.step('el Resumen, con una carga completa, muestra el nuevo objetivo', async () => {
      await page.goto('/')
      await expect(page.getByText(`Objetivo: ${changed} min`)).toBeVisible()
      await expect(page.getByText(`Objetivo: ${original} min`)).toHaveCount(0)
    })

    await test.step('recargar Configuración conserva el valor guardado en el servidor', async () => {
      await page.goto('/configuracion/empresa')
      await expect(field).toHaveValue(String(changed))
    })
  } finally {
    await saveTarget(page, original)
  }

  await test.step('con el original restaurado el Resumen vuelve a mostrarlo', async () => {
    await page.goto('/')
    await expect(page.getByText(`Objetivo: ${original} min`)).toBeVisible()
  })
})
