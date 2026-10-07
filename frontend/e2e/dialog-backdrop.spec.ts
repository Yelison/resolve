import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

const BACKDROP = { x: 10, y: 10 }

async function openInvite(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/equipo')
  await page.getByRole('button', { name: 'Invitar agente' }).click()
  const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
  await expect(dialog).toBeVisible()
  const box = (await dialog.boundingBox())!
  return { dialog, inside: { x: box.x + box.width / 2, y: box.y + 20 } }
}

test.describe('diálogo · pulsación en el fondo', () => {
  test('un clic en el fondo cierra el diálogo', async ({ page }) => {
    const { dialog } = await openInvite(page)
    await page.mouse.click(BACKDROP.x, BACKDROP.y)
    await expect(dialog).toBeHidden()
  })

  test('una pulsación que empieza en el fondo y se suelta dentro no lo cierra', async ({ page }) => {
    const { dialog, inside } = await openInvite(page)
    await page.mouse.move(BACKDROP.x, BACKDROP.y)
    await page.mouse.down()
    await page.mouse.move(inside.x, inside.y, { steps: 5 })
    await page.mouse.up()
    await expect(dialog).toBeVisible()
  })

  test('una pulsación que empieza dentro y se suelta en el fondo no lo cierra', async ({ page }) => {
    const { dialog, inside } = await openInvite(page)
    await page.mouse.move(inside.x, inside.y)
    await page.mouse.down()
    await page.mouse.move(BACKDROP.x, BACKDROP.y, { steps: 5 })
    await page.mouse.up()
    await expect(dialog).toBeVisible()
  })
})
