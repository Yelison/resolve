import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { PermissionsMatrix } from './PermissionsMatrix'
import { accessLabels, capabilities, groupBySection } from './permissions'
import { mockElementWidth, mockViewport } from './viewportTesting'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderMatrix(me: object = adminMe) {
  mockApi({ 'GET /api/me': { body: me } })
  return renderWithProviders(<PermissionsMatrix />)
}

describe('PermissionsMatrix con ancho para la tabla', () => {
  it('lista cada capacidad de permissions.ts con sus cuatro columnas', () => {
    mockViewport(1440)
    mockElementWidth(900)
    renderMatrix()
    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual(['Capacidad', 'Administrador', 'Agente', 'Cliente'])
    for (const capability of capabilities) {
      expect(within(table).getByRole('rowheader', { name: new RegExp(`^${capability.label}`) })).toBeInTheDocument()
    }
  })

  it('agrupa las capacidades por sección', () => {
    mockViewport(1440)
    mockElementWidth(900)
    renderMatrix()
    const sectionHeaders = within(screen.getByRole('table'))
      .getAllByRole('rowheader')
      .filter((header) => header.getAttribute('scope') === 'rowgroup')
    expect(sectionHeaders.map((header) => header.textContent)).toEqual(groupBySection().map((section) => section.name))
  })

  it('dice el acceso con texto, no solo con color o icono', () => {
    mockViewport(1440)
    mockElementWidth(900)
    renderMatrix()
    const row = screen.getByRole('rowheader', { name: /^Invitar, cambiar el rol y retirar miembros/ }).closest('tr')!
    const [admin, agent, customer] = within(row).getAllByRole('cell')
    expect(admin).toHaveAccessibleName(accessLabels.allowed)
    expect(agent).toHaveAccessibleName(accessLabels.no)
    expect(customer).toHaveAccessibleName(accessLabels.no)
  })

  it('«Solo los suyos» y «Solo los públicos» son «Con límites», con su icono y el estado dicho a quien lee', () => {
    mockViewport(1440)
    mockElementWidth(900)
    renderMatrix()
    const own = screen.getByRole('rowheader', { name: /^Ver tickets y sus mensajes/ }).closest('tr')!
    const cell = within(own).getAllByRole('cell')[2]!
    expect(cell).toHaveTextContent('Con límites: Solo los suyos')
    expect(cell.querySelector('svg')).not.toBeNull()
    const published = screen.getByRole('rowheader', { name: /^Leer artículos/ }).closest('tr')!
    expect(within(published).getAllByRole('cell')[2]).toHaveTextContent('Con límites: Solo los públicos')
  })

  it('la leyenda explica los tres estados', () => {
    mockViewport(1440)
    mockElementWidth(900)
    renderMatrix()
    const legend = screen.getByRole('list', { name: 'Leyenda' })
    for (const text of ['Permitido', 'Con límites', 'Sin acceso']) {
      expect(within(legend).getByText(text)).toBeInTheDocument()
    }
    expect(within(legend).getAllByRole('listitem')).toHaveLength(3)
  })

  it('es informativa: sin aviso de validación en el servidor y sin ofrecer guardar', () => {
    mockViewport(1440)
    mockElementWidth(900)
    renderMatrix()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/servidor/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('PermissionsMatrix sin ancho para la tabla', () => {
  it('muestra un rol a la vez, con el del usuario marcado, y agrupa por sección', async () => {
    mockViewport(390)
    renderMatrix({ ...adminMe, role: 'agent' })
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    const roles = screen.getByRole('group', { name: 'Rol' })
    await waitFor(() =>
      expect(within(roles).getByRole('button', { name: 'Agente' })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(
      within(roles)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['Administrador', 'Agente', 'Cliente'])
    expect(within(roles).getByRole('button', { name: 'Agente' })).toHaveAttribute('aria-pressed', 'true')
    for (const section of groupBySection()) {
      expect(screen.getByRole('heading', { name: section.name })).toBeInTheDocument()
    }
    const agentRow = screen.getByText('Invitar, cambiar el rol y retirar miembros').closest('li')!
    expect(agentRow).toHaveTextContent(accessLabels.no)
  })

  it('cambiar de rol cambia lo que se muestra sin ocultar ninguna capacidad', async () => {
    mockViewport(390)
    renderMatrix({ ...adminMe, role: 'agent' })
    await userEvent.click(screen.getByRole('button', { name: 'Administrador' }))
    expect(screen.getByRole('button', { name: 'Administrador' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Agente' })).toHaveAttribute('aria-pressed', 'false')
    const row = screen.getByText('Invitar, cambiar el rol y retirar miembros').closest('li')!
    expect(row).toHaveTextContent(accessLabels.allowed)
    expect(screen.getAllByRole('listitem')).toHaveLength(capabilities.length + 3)

    await userEvent.click(screen.getByRole('button', { name: 'Cliente' }))
    expect(screen.getByText('Ver tickets y sus mensajes').closest('li')).toHaveTextContent(
      `Con límites: ${accessLabels.own}`,
    )
  })

  it('con ventana de escritorio pero panel estrecho también usa el selector de rol', () => {
    mockViewport(768)
    mockElementWidth(392)
    renderMatrix()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Permisos por rol' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Tickets' })).toBeInTheDocument()
  })
})
