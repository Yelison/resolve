import { expect, test, type Page } from '@playwright/test'
import { demoUsers, loginAs } from './fixtures'

/**
 * Contra el backend real: el objetivo de primera respuesta de Configuración llega a Inicio. Es estado del
 * espacio, compartido con las demás pruebas del smoke, así que se lee el valor actual, se guarda uno distinto
 * (si no, «Guardar cambios» queda deshabilitado) y se restaura al terminar aunque algo falle.
 */
/**
 * La celda «Primera respuesta» de Inicio dice el objetivo en su texto: «Dentro del objetivo de 37 min», «Por encima del
 * objetivo de 37 min» o, sin datos de primera respuesta, «Objetivo: 37 min».
 */
function targetText(minutes: number) {
  return new RegExp(`objetivo( de)?:?\\s*${minutes}\\s*min`, 'i')
}

function firstResponseCell(page: Page) {
  return page.getByRole('group', { name: 'Así va el soporte hoy' }).getByRole('link', { name: /Primera respuesta/ })
}

async function saveTarget(page: Page, minutes: number) {
  await page.goto('/configuracion/empresa')
  const field = page.getByRole('textbox', { name: 'Objetivo de primera respuesta' })
  await field.fill(String(minutes))
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cambios guardados')).toBeVisible()
}

test('cambiar el objetivo de primera respuesta en Configuración se ve en Inicio', async ({ page }) => {
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

    await test.step('Inicio, con una carga completa, muestra el nuevo objetivo', async () => {
      await page.goto('/')
      await expect(firstResponseCell(page)).toHaveAccessibleName(targetText(changed))
      await expect(firstResponseCell(page)).not.toHaveAccessibleName(targetText(original))
    })

    await test.step('recargar Configuración conserva el valor guardado en el servidor', async () => {
      await page.goto('/configuracion/empresa')
      await expect(field).toHaveValue(String(changed))
    })
  } finally {
    await saveTarget(page, original)
  }

  await test.step('con el original restaurado Inicio vuelve a mostrarlo', async () => {
    await page.goto('/')
    await expect(firstResponseCell(page)).toHaveAccessibleName(targetText(original))
  })
})
