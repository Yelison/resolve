import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { CustomerSummary } from '../../domain/customer'
import { CustomersTable, type CustomersTableProps } from './CustomersTable'

const customer = (overrides: Partial<CustomerSummary> = {}): CustomerSummary => ({
  id: 'c-maria',
  name: 'María Pérez',
  email: 'maria@cliente.example',
  company: 'Acme Studio',
  openTickets: 3,
  totalTickets: 12,
  createdAt: '2026-09-01T10:00:00Z',
  archived: false,
  ...overrides,
})

function renderTable(props: Partial<CustomersTableProps> = {}) {
  return render(
    <MemoryRouter>
      <CustomersTable customers={[customer()]} caption="Mostrando 1 resultados" {...props} />
    </MemoryRouter>,
  )
}

describe('CustomersTable', () => {
  it('es una tabla con nombre accesible, columnas y la leyenda como descripción', () => {
    renderTable({ caption: 'Mostrando 2 resultados', customers: [customer(), customer({ id: 'c-2', name: 'Ana' })] })
    const table = screen.getByRole('table', { name: 'Clientes' })
    expect(table).toHaveAccessibleDescription('Mostrando 2 resultados')
    expect(screen.getByText('Mostrando 2 resultados')).toBeVisible()
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual([
      'Cliente',
      'Empresa',
      'Correo',
      'Tickets',
      'Estado',
      'Acciones',
    ])
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })

  it('cada fila enlaza al cliente con su nombre y muestra empresa, correo, tickets y estado', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'María Pérez' })).toHaveAttribute('href', '/clientes/c-maria')
    const row = screen.getAllByRole('row')[1]!
    expect(within(row).getByText('Acme Studio')).toBeInTheDocument()
    expect(within(row).getByText('maria@cliente.example')).toBeInTheDocument()
    expect(within(row).getByText(/3 abiertos/)).toHaveTextContent('3 abiertos, 12 en total')
    expect(within(row).getByText('Activo')).toBeInTheDocument()
  })

  it('marca a los clientes archivados y nombra la falta de empresa', () => {
    renderTable({ customers: [customer({ archived: true, company: null })] })
    const row = screen.getAllByRole('row')[1]!
    expect(within(row).getByText('Archivado')).toBeInTheDocument()
    expect(within(row).queryByText('Activo')).not.toBeInTheDocument()
    expect(within(row).getByText('Sin empresa')).toBeInTheDocument()
  })

  it('no dibuja el menú de acciones sin acciones', () => {
    renderTable()
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
    renderTable({ actions: () => [] })
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
  })

  it('dibuja el menú de cada fila con sus acciones cuando se pasan', async () => {
    const onSelect = vi.fn()
    renderTable({ actions: (item) => [{ id: 'open', label: `Abrir ${item.name}`, onSelect }] })
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de María Pérez' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Abrir María Pérez' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
