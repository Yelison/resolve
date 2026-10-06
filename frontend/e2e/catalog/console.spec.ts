import { expect, test } from '../fixtures'

test('una carga directa de /catalogo no avisa en la consola', async ({ page }) => {
  const messages: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') messages.push(message.text())
  })
  await page.goto('/catalogo')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(messages).toEqual([])
})
