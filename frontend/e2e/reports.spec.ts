import { readFile } from 'node:fs/promises'
import { expect, me, test } from './fixtures'

test.describe('reportes', () => {
  test('muestra las cifras, el gráfico con su tabla, los canales y los agentes con su estado', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible()
    await expect(page.getByText('61 más (20 %) frente a los 7 días anteriores')).toBeVisible()
    await expect(page.getByText('83 resueltos por cada 100 creados')).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Correo' })).toBeVisible()

    // La alternativa tabular del gráfico se alcanza con el teclado.
    await page.getByRole('button', { name: 'Ver como tabla' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('table', { name: 'Solicitudes y resueltos por día' })).toBeVisible()

    const agents = page.getByRole('table', { name: 'Rendimiento por agente' })
    await expect(agents.getByRole('row')).toHaveCount(7) // cabecera + 6
    await expect(agents.getByRole('row', { name: /Pablo Viejo/ })).toContainText('Retirado')
    await expect(agents.getByRole('row', { name: /Sofía Ríos/ })).toContainText('Invitación pendiente')
    await expect(agents.getByRole('row', { name: /Laura Méndez/ })).not.toContainText('Retirado')
  })

  test('mientras el informe carga muestra el esqueleto y no deja exportar', async ({ page }) => {
    await page.route('**/api/reports/summary*', () => new Promise(() => {}))
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible()
    await expect(page.getByText('Cargando el informe…')).toBeAttached()
    await expect(page.getByRole('combobox', { name: 'Periodo' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Exportar CSV' })).toBeDisabled()
    await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toHaveCount(0)
  })

  test('cambiar el periodo cambia la petición y la URL, y 90 días agrega por semanas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes')
    await expect(page.getByText(/frente a los 7 días anteriores/)).toBeVisible()

    const request = page.waitForRequest((req) => req.url().includes('/api/reports/summary?period=30d'))
    await page.getByRole('combobox', { name: 'Periodo' }).selectOption('30d')
    await request
    await expect(page).toHaveURL(/\?period=30d$/)
    await expect(page.getByText(/frente a los 30 días anteriores/)).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Teléfono' })).toBeVisible()

    await page.getByRole('combobox', { name: 'Periodo' }).selectOption('90d')
    await expect(page.getByRole('img', { name: 'Solicitudes y resueltos por semana' })).toBeVisible()
    // Sin periodo anterior ni medianas: ni porcentaje inventado ni cifras falsas.
    await expect(page.getByText('3900 más frente a los 90 días anteriores')).toBeVisible()
    await expect(page.getByText('Sin datos').first()).toBeVisible()
  })

  test('un periodo no válido en la URL vuelve al de por defecto', async ({ page }) => {
    await page.goto('/reportes?period=foo')
    await expect(page.getByText(/frente a los 7 días anteriores/)).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Periodo' })).toHaveValue('7d')
    await expect(page).toHaveURL(/\/reportes$/)
  })

  test('exporta el CSV de agentes con BOM, estado y las fórmulas neutralizadas', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/reportes?period=30d')
    await expect(page.getByRole('table', { name: 'Rendimiento por agente' })).toBeVisible()
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exportar CSV' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe('reporte-agentes-30d-2026-10-04.csv')

    const bytes = await readFile((await file.path())!)
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const rows = bytes.toString('utf8').slice(1).split('\r\n')
    expect(rows[0]).toBe('Agente,Estado,Resueltos,Primera respuesta (min),Asignados abiertos')
    expect(rows).toContain('Laura Méndez,Activo,128,14,1')
    expect(rows).toContain('Pablo Viejo,Retirado,9,45,0')
    expect(rows).toContain('Sofía Ríos,Invitación pendiente,2,,0')
    expect(rows).toContain(`"'=Carlos, ""Fórmula""",Activo,1,,0`)
  })

  test('un cliente no tiene acceso a los reportes', async ({ page }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({ json: { ...me, role: 'customer', customerId: 'c-maria' } }),
    )
    const reportRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/reports/')) reportRequests.push(req.url())
    })
    await page.goto('/reportes')
    await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible()
    expect(reportRequests).toEqual([])
  })
})
