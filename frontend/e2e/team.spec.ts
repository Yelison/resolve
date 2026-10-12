import type { Page } from '@playwright/test'
import type { TeamMember } from '../src/api/schema'
import { expect, me, test } from './fixtures'
import { CSRF_TOKEN } from './mocks/session'
import { teamMember } from './mocks/shared'

/** Equipo grande para las pruebas de muchos datos: `active` agentes activos (el 8.º con un nombre de 120 caracteres) y `invited` invitaciones. */
function bigTeam(active: number, invited: number, longNames = false): TeamMember[] {
  const people = Array.from({ length: active }, (_, index) =>
    teamMember({
      id: `u-p${index}`,
      name: longNames && index === 7 ? 'B'.repeat(120) : `Persona ${String(index + 1).padStart(2, '0')}`,
      email: `persona${index + 1}@acme.example`,
      role: index < 2 ? 'admin' : 'agent',
      openTickets: 12 - Math.min(index, 11),
      urgentOpenTickets: index % 3 === 0 ? 2 : 0,
    }),
  )
  const invites = Array.from({ length: invited }, (_, index) =>
    teamMember({
      id: `u-i${index}`,
      name: `invitada${index + 1}`,
      email: longNames && index === 0 ? `${'c'.repeat(100)}@acme.example` : `invitada${index + 1}@acme.example`,
      status: 'invited',
      joinedAt: null,
      invitedAt: new Date(Date.now() - (index + 2) * 86_400_000).toISOString(),
    }),
  )
  return [...people, ...invites]
}

/** Sirve `members` en `GET /members`; el resto de la API simulada sigue igual. */
async function serveTeam(page: Page, members: TeamMember[]) {
  await page.route('**/api/members', (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: members }) : route.fallback(),
  )
}

test.describe('equipo', () => {
  test('la lista muestra el equipo actual, sus métricas y oculta a los retirados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table.getByRole('row')).toHaveCount(6) // encabezado + 5 actuales
    await expect(page.getByRole('region', { name: 'Carga ahora' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Roles' })).toBeVisible()
    await expect(table.getByText('Invitación pendiente')).toBeVisible()
    await expect(table.getByText('Pablo Viejo')).toHaveCount(0)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Retirados' }).click()
    await expect(page).toHaveURL(/estado=retirados/)
    await expect(table.getByRole('row')).toHaveCount(2)
    await expect(table.getByText('Pablo Viejo')).toBeVisible()
    await expect(page.getByRole('button', { name: /Acciones de/ })).toHaveCount(0)
  })

  test('invita a una persona y aparece como invitación pendiente', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Invitar agente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
    await expect(dialog.getByText('No enviamos un aviso automático: avísale tú.')).toBeVisible()

    await dialog.getByRole('textbox', { name: 'Correo' }).fill('laura@acme.example')
    await dialog.getByRole('button', { name: 'Invitar' }).click()
    await expect(dialog.getByText('Ya forma parte del equipo.')).toBeVisible()

    await dialog.getByRole('textbox', { name: 'Correo' }).fill('ana@acme.example')
    await dialog.getByRole('button', { name: 'Invitar' }).click()
    await expect(page.getByText('Invitación creada')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('table', { name: 'Equipo' }).getByText('ana', { exact: true })).toBeVisible()
  })

  test('cambia el rol y el último administrador no se puede degradar', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Acciones de Laura Méndez' }).click()
    await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
    const dialog = page.getByRole('dialog', { name: 'Cambiar rol' })
    await dialog.getByRole('combobox', { name: 'Rol' }).selectOption('admin')
    await dialog.getByRole('button', { name: 'Guardar rol' }).click()
    await expect(page.getByText('Rol actualizado')).toBeVisible()
    await expect(page.getByRole('row', { name: /Laura Méndez/ })).toContainText('Administrador')

    // Con dos administradores se puede degradar a uno; el que queda ya no.
    await page.getByRole('button', { name: 'Acciones de Laura Méndez' }).click()
    await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
    await dialog.getByRole('combobox', { name: 'Rol' }).selectOption('agent')
    await dialog.getByRole('button', { name: 'Guardar rol' }).click()
    await expect(page.getByRole('row', { name: /Laura Méndez/ })).toContainText('Agente')

    // El que queda es el único administrador: la interfaz lo dice antes de intentarlo (la nota bajo el menú y bajo el
    // selector de rol), con «Agente» y «Retirar del equipo» deshabilitados.
    const note = 'Acme Studio necesita al menos un administrador. Da el rol a otra persona antes de cambiar el tuyo.'
    await page.getByRole('button', { name: `Acciones de ${me.user.name}` }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: 'Retirar del equipo' })).toHaveAttribute('aria-disabled', 'true')
    await expect(menu).toHaveAccessibleDescription(note)
    await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
    await expect(dialog.getByRole('option', { name: 'Agente' })).toBeDisabled()
    await expect(dialog.getByRole('combobox', { name: 'Rol' })).toHaveAccessibleDescription(note)
    await expect(dialog.getByRole('button', { name: 'Guardar rol' })).toBeDisabled()
  })

  test('el servidor sigue siendo la defensa real: el 409 del último administrador lleva su tipo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await expect(page.getByRole('table', { name: 'Equipo' })).toBeVisible()
    const attempt = (path: string) =>
      page.evaluate(
        async ([url, token]) => {
          const response = await fetch(url!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': token!, 'X-Organization-Id': 'org-1' },
            body: JSON.stringify({ role: 'agent' }),
          })
          return { status: response.status, type: ((await response.json()) as { type?: string }).type }
        },
        [path, CSRF_TOKEN],
      )
    const lastAdmin = { status: 409, type: 'https://resolve.example/problems/last-admin' }
    expect(await attempt(`/api/members/${me.user.id}/role`)).toEqual(lastAdmin)
    expect(await attempt(`/api/members/${me.user.id}/remove`)).toEqual({ status: 409, type: undefined })
  })

  test('retira a un miembro tras confirmar y pasa al filtro de retirados', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Acciones de Daniel Santos' }).click()
    await page.getByRole('menuitem', { name: 'Retirar del equipo' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
    await expect(dialog).toContainText('Daniel Santos dejará de poder entrar')
    await dialog.getByRole('button', { name: 'Retirar del equipo' }).click()
    await expect(page.getByText('Miembro retirado')).toBeVisible()
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table.getByText('Daniel Santos')).toHaveCount(0)

    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Retirados' }).click()
    await expect(table.getByText('Daniel Santos')).toBeVisible()
  })

  test('un agente ve el equipo en lectura, sin invitar ni menú de acciones', async ({ page }) => {
    await page.route('**/api/me', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...me, role: 'agent' }) }),
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await expect(page.getByRole('table', { name: 'Equipo' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Carga ahora' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Roles' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Invitar agente' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: /Invitaciones pendientes/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Acciones de|Cancelar invitación de/ })).toHaveCount(0)
  })

  test('en móvil el equipo son tarjetas y el diálogo de invitación cabe en 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 })
    await page.goto('/equipo')
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table).toBeVisible()
    // Las tarjetas muestran el encabezado de columnas solo a lectores de pantalla.
    const header = table.getByRole('row').first()
    expect((await header.boundingBox())?.width).toBeLessThanOrEqual(1)
    const card = table.getByRole('row').nth(1)
    expect((await card.boundingBox())!.width).toBeGreaterThan(250)

    await page.getByRole('button', { name: 'Invitar agente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
    const box = (await dialog.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('un administrador da acceso al portal a un cliente y la insignia cambia', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/clientes/c-carlos')
    await expect(page.getByText('Sin acceso')).toBeVisible()
    await page.getByRole('button', { name: 'Dar acceso al portal' }).click()
    const dialog = page.getByRole('dialog', { name: 'Dar acceso al portal' })
    await dialog.getByRole('button', { name: 'Dar acceso' }).click()
    await expect(page.getByText('Invitación creada')).toBeVisible()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Invitación pendiente')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dar acceso al portal' })).toHaveCount(0)
  })

  test('en el rango intermedio cada fila tiene tantas cabeceras como celdas', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/equipo')
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table).toBeVisible()
    const headers = await table.getByRole('columnheader').count()
    expect(headers).toBe(5)
    for (const row of (await table.getByRole('row').all()).slice(1)) {
      expect(await row.getByRole('cell').count()).toBe(headers)
    }
    // Una sola fila de cabecera: los títulos visibles comparten la misma línea.
    const tops = await Promise.all(
      ['Agente', 'Estado', 'Carga'].map(
        async (name) => (await table.getByRole('columnheader', { name }).boundingBox())!.y,
      ),
    )
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1)
  })

  for (const width of [320, 1440]) {
    test(`un nombre de 120 caracteres no se recorta en los diálogos · ${width}px`, async ({ page }) => {
      const name = 'A'.repeat(120)
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/equipo')
      await page.getByRole('button', { name: 'Invitar agente' }).click()
      const invite = page.getByRole('dialog', { name: 'Invitar agente' })
      const email = `${'c'.repeat(100)}@acme.example`
      await invite.getByRole('textbox', { name: 'Correo' }).fill(email)
      await invite.getByRole('textbox', { name: 'Nombre' }).fill(name)
      await invite.getByRole('button', { name: 'Invitar' }).click()
      await expect(invite).toBeHidden()

      const fits = async (dialog: ReturnType<typeof page.getByRole>) => {
        const box = (await dialog.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
        const clipped = await dialog.evaluate((element) => {
          const all = [element, ...element.querySelectorAll<HTMLElement>('*')]
          return all.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.tagName)
        })
        expect(clipped, 'ningún elemento del diálogo desborda').toEqual([])
      }

      // Una invitación se cancela (no se «retira»): el diálogo nombra el correo.
      await page.getByRole('button', { name: `Acciones de ${name}` }).click()
      await page.getByRole('menuitem', { name: 'Cancelar invitación' }).click()
      const cancel = page.getByRole('dialog', { name: '¿Cancelar esta invitación?' })
      await expect(cancel).toContainText(email)
      await fits(cancel)
      await cancel.getByRole('button', { name: 'Conservar invitación' }).click()

      await page.getByRole('button', { name: `Acciones de ${name}` }).click()
      await page.getByRole('menuitem', { name: 'Cambiar rol' }).click()
      await fits(page.getByRole('dialog', { name: 'Cambiar rol' }))
    })
  }
})

test.describe('equipo · nombres largos al retirar', () => {
  for (const width of [320, 1440]) {
    test(`el diálogo de retirar a alguien con un nombre de 120 caracteres no se recorta · ${width}px`, async ({
      page,
    }) => {
      const name = 'B'.repeat(120)
      await serveTeam(page, bigTeam(10, 0, true))
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/equipo')
      await page.getByRole('button', { name: `Acciones de ${name}` }).click()
      await page.getByRole('menuitem', { name: 'Retirar del equipo' }).click()
      const remove = page.getByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
      await expect(remove).toContainText(name)
      const box = (await remove.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      const clipped = await remove.evaluate((element) =>
        [element, ...element.querySelectorAll<HTMLElement>('*')]
          .filter((node) => node.scrollWidth > node.clientWidth + 1)
          .map((node) => node.tagName),
      )
      expect(clipped, 'ningún elemento del diálogo desborda').toEqual([])
    })
  }
})

test.describe('equipo · foco al cerrar un diálogo', () => {
  test('tras retirar a un miembro con éxito el foco va al título de la página', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Acciones de Daniel Santos' }).click()
    await page.getByRole('menuitem', { name: 'Retirar del equipo' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
    await dialog.getByRole('button', { name: 'Retirar del equipo' }).click()
    await expect(page.getByText('Miembro retirado')).toBeVisible()
    // La fila sale de la lista un instante después del cierre: se espera a que ya no esté y el foco sigue en el título.
    await expect(page.getByRole('row', { name: /Daniel Santos/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Equipo' })).toBeFocused()
  })

  test('tras un 403 y «Cancelar» el foco va al título de la página', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    let role: 'admin' | 'agent' = 'admin'
    // Las rutas registradas después tienen prioridad; `fallback` deja pasar al resto de la API simulada.
    await page.route('**/api/me', (route) =>
      role === 'agent' ? route.fulfill({ json: { ...me, role: 'agent' } }) : route.fallback(),
    )
    await page.route('**/api/members/*/remove', (route) => {
      role = 'agent'
      return route.fulfill({
        status: 403,
        contentType: 'application/problem+json',
        json: { status: 403, title: 'Prohibido', detail: 'Tu rol no permite esta acción.' },
      })
    })
    await page.goto('/equipo')
    await page.getByRole('button', { name: 'Acciones de Daniel Santos' }).click()
    await page.getByRole('menuitem', { name: 'Retirar del equipo' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Retirar a este miembro del equipo?' })
    await dialog.getByRole('button', { name: 'Retirar del equipo' }).click()
    await expect(dialog.getByRole('alert')).toContainText('Tu rol no permite esta acción.')
    await expect(page.getByRole('button', { name: /Acciones de/ })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Equipo' })).toBeFocused()
  })
})

test.describe('equipo · carga, invitaciones y muchos datos', () => {
  test('cancela una invitación con confirmación y desaparece el panel', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    const panel = page.getByRole('region', { name: /Invitaciones pendientes/ })
    await expect(panel).toContainText('sofia@acme.example')
    await expect(panel).toContainText('Enviada hace 1 hora')
    await expect(page.getByText(/Reenviar|Caducada/)).toHaveCount(0)
    await panel.getByRole('button', { name: 'Cancelar invitación de sofia@acme.example' }).click()
    const dialog = page.getByRole('dialog', { name: '¿Cancelar esta invitación?' })
    await dialog.getByRole('button', { name: 'Cancelar invitación' }).click()
    await expect(page.getByText('Invitación cancelada')).toBeVisible()
    await expect(panel).toHaveCount(0)
    await expect(page.getByRole('heading', { level: 1, name: 'Equipo' })).toBeFocused()
  })

  test('con 22 personas y 6 invitaciones: ocho barras, desplegar, filtrar por invitación y paginar', async ({
    page,
  }) => {
    await serveTeam(page, bigTeam(22, 6))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    const load = page.getByRole('region', { name: 'Carga ahora' })
    const bars = load.getByRole('list', { name: 'Tickets abiertos por persona' }).getByRole('listitem')
    await expect(bars).toHaveCount(8)
    await load.getByRole('button', { name: 'Ver las 22 personas' }).click()
    await expect(page).toHaveURL(/carga=todas/)
    await expect(bars).toHaveCount(22)
    await load.getByRole('button', { name: 'Ver solo las 8 más cargadas' }).click()
    await expect(bars).toHaveCount(8)

    const panel = page.getByRole('region', { name: /Invitaciones pendientes/ })
    await expect(panel.getByRole('listitem')).toHaveCount(3)
    await panel.getByRole('button', { name: 'Ver las 6 invitaciones pendientes' }).click()
    await expect(page).toHaveURL(/estado=invitados/)
    await expect(panel).toHaveCount(0)
    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table.getByRole('row')).toHaveCount(7)
    await page.getByRole('button', { name: 'Quitar el filtro Estado: Invitación pendiente' }).click()
    await expect(page).not.toHaveURL(/estado=/)
    await expect(panel).toBeVisible()

    await expect(table.getByRole('row')).toHaveCount(11)
    await expect(page.getByText('1–10 de 28 resultados')).toBeVisible()
    await page.getByRole('button', { name: 'Página 3' }).click()
    await expect(table.getByRole('row')).toHaveCount(9)
  })

  test('«Ver como tabla» da las cifras de cada persona', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await page.goto('/equipo')
    const load = page.getByRole('region', { name: 'Carga ahora' })
    await load.getByRole('button', { name: 'Ver como tabla' }).click()
    const table = load.getByRole('table', { name: 'Tickets abiertos por persona' })
    await expect(table.getByRole('columnheader')).toHaveText(['Persona', 'Abiertos', 'Urgentes', 'Resto'])
    await expect(table.getByRole('row', { name: /Laura Méndez/ })).toContainText('1')
  })

  test('«Carga ahora» y la columna lateral se apilan por debajo de 1200 px y van en paralelo desde 1200 px', async ({
    page,
  }) => {
    const positions = async (width: number) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/equipo')
      const load = (await page.getByRole('region', { name: 'Carga ahora' }).boundingBox())!
      const roles = (await page.getByRole('region', { name: 'Roles' }).boundingBox())!
      return { load, roles }
    }
    for (const width of [768, 1024, 1199]) {
      const { load, roles } = await positions(width)
      expect(roles.y, `apilados a ${width}px`).toBeGreaterThanOrEqual(load.y + load.height)
    }
    for (const width of [1200, 1440]) {
      const { load, roles } = await positions(width)
      expect(roles.x, `en paralelo a ${width}px`).toBeGreaterThanOrEqual(load.x + load.width)
    }
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [320, 390, 767, 768, 1024, 1199, 1200, 1440]) {
      test(`sin scroll horizontal ni textos recortados con nombres de 120 caracteres · ${width}px · ${theme}`, async ({
        page,
      }) => {
        await page.addInitScript((value) => localStorage.setItem('resolve-theme', value), theme)
        await serveTeam(page, bigTeam(22, 6, true))
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/equipo')
        await page
          .getByRole('region', { name: 'Carga ahora' })
          .getByRole('button', { name: 'Ver las 22 personas' })
          .click()
        await expect(page.getByRole('table', { name: 'Equipo' })).toBeVisible()
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )
        expect(overflow).toBeLessThanOrEqual(0)
        // Ningún texto de las secciones de la página queda recortado por su caja.
        const clipped = await page
          .locator('main section')
          .evaluateAll((sections) =>
            sections.flatMap((section) =>
              [...section.querySelectorAll<HTMLElement>('*')]
                .filter(
                  (node) =>
                    node.clientWidth > 2 &&
                    node.scrollWidth > node.clientWidth + 1 &&
                    getComputedStyle(node).overflowX !== 'auto',
                )
                .map((node) => `${node.tagName}.${node.className}`),
            ),
          )
        expect(clipped).toEqual([])
        // Controles táctiles de 44 px por debajo de 768 px.
        if (width < 768) {
          for (const control of await page.locator('main button:visible, main a:visible').all()) {
            const box = (await control.boundingBox())!
            expect(box.height, await control.innerText()).toBeGreaterThanOrEqual(43.5)
          }
        }
      })
    }
  }

  /*
   * Con la lista retenida se mide dónde queda cada título al llegar los datos. El esqueleto reserva ocho filas de carga,
   * «Roles» y el panel de invitaciones a su altura máxima (3 filas y «Ver las N»), así que la página nunca crece:
   * solo se contrae, y como mucho en lo que sobraba (filas de carga y de invitaciones que no hacían falta).
   */
  const layouts: { name: string; members?: TeamMember[]; active: number; invitations: number }[] = [
    { name: '22 personas y 6 invitaciones', members: bigTeam(22, 6), active: 22, invitations: 6 },
    { name: 'demo', active: 4, invitations: 1 },
  ]
  for (const width of [390, 1440]) {
    for (const layout of layouts) {
      test(`la carga reserva su sitio y la página solo se contrae · ${layout.name} · ${width}px`, async ({ page }) => {
        if (layout.members) await serveTeam(page, layout.members)
        let release!: () => void
        const gate = new Promise<void>((resolve) => (release = resolve))
        await page.route('**/api/members', async (route) => {
          if (route.request().method() === 'GET') await gate
          await route.fallback()
        })
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/equipo')
        const titles = {
          roles: page.getByRole('heading', { level: 2, name: 'Roles' }),
          load: page.getByRole('region', { name: 'Carga ahora' }),
          members: page.getByRole('heading', { level: 2, name: /^Miembros/ }),
        }
        await expect(titles.members).toBeVisible()
        // El rol llega con `/me`, que no está retenido: el panel de invitaciones ya está reservado.
        await expect(page.getByText('Cargando las invitaciones…')).toBeAttached()
        const measure = async () => ({
          loadHeight: (await titles.load.boundingBox())!.height,
          roles: (await titles.roles.boundingBox())!.y,
          members: (await titles.members.boundingBox())!.y,
        })
        const before = await measure()
        const reservedInvitations = (await page
          .getByText('Cargando las invitaciones…')
          .locator('xpath=following-sibling::div[1]')
          .boundingBox())!.height
        release()
        await expect(page.getByRole('table', { name: 'Equipo' })).toBeVisible()
        const after = await measure()

        // «Carga ahora» no crece nunca: el esqueleto ya mide lo máximo (ocho filas, su pie y el alcance del título).
        expect(after.loadHeight - before.loadHeight, JSON.stringify({ before, after })).toBeLessThanOrEqual(1)
        // «Miembros» no baja nunca: lo reservado cubre el máximo que la página puede mostrar.
        const shift = after.members - before.members
        expect(shift, `«Miembros» se movió ${shift}px: ${JSON.stringify({ before, after })}`).toBeLessThanOrEqual(1)
        // Y cuando sube, es por lo reservado que no hizo falta (filas de carga y de invitaciones): una contracción acotada.
        const bound = before.loadHeight - after.loadHeight + reservedInvitations + 1
        expect(-shift, `«Miembros» subió ${-shift}px (cota ${bound}px)`).toBeLessThanOrEqual(bound)
        // Con los datos que llenan lo reservado (22 personas y 6 invitaciones) apenas hay contracción: como mucho una línea de
        // texto (20 px) por invitación visible, porque el correo reservado (27 caracteres) es algo más largo que el de estos datos.
        if (layout.members) expect(-shift).toBeLessThanOrEqual(3 * 20)
      })
    }
  }

  test('volver a invitar a una invitación cancelada la reactiva en vez de duplicarla', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    const panel = page.getByRole('region', { name: /Invitaciones pendientes/ })
    await panel.getByRole('button', { name: 'Cancelar invitación de sofia@acme.example' }).click()
    await page
      .getByRole('dialog', { name: '¿Cancelar esta invitación?' })
      .getByRole('button', { name: 'Cancelar invitación' })
      .click()
    await expect(page.getByText('Invitación cancelada', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Invitar agente' }).click()
    const dialog = page.getByRole('dialog', { name: 'Invitar agente' })
    await dialog.getByRole('textbox', { name: 'Correo' }).fill('sofia@acme.example')
    await dialog.getByRole('button', { name: 'Invitar' }).click()
    await expect(dialog).toBeHidden()

    const table = page.getByRole('table', { name: 'Equipo' })
    await expect(table.getByRole('row', { name: /sofia@acme.example/ })).toHaveCount(1)
    await expect(panel).toContainText('sofia@acme.example')
    await page.getByRole('button', { name: 'Estado' }).click()
    await page.getByRole('menuitem', { name: 'Retirados' }).click()
    await expect(table.getByRole('row', { name: /sofia@acme.example/ })).toHaveCount(0)
  })

  test('con teclado, «Ver las N» y «Quitar filtros» dejan el foco en el título de la lista', async ({ page }) => {
    await serveTeam(page, bigTeam(22, 6))
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/equipo')
    const members = page.getByRole('heading', { level: 2, name: /^Miembros/ })
    await page.getByRole('button', { name: 'Ver las 6 invitaciones pendientes' }).focus()
    await page.keyboard.press('Enter')
    await expect(members).toBeFocused()
    await page.getByRole('searchbox', { name: 'Buscar miembros' }).fill('zzzz')
    await page.getByRole('button', { name: 'Quitar filtros' }).focus()
    await page.keyboard.press('Enter')
    await expect(members).toBeFocused()
  })
})
