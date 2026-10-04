import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import type { TicketSummary } from '../../../domain/ticket'
import { TicketRow, TicketTable } from './TicketRow'

const ticket: TicketSummary = {
  id: 't-1048',
  number: 1048,
  subject: 'No puedo acceder a mi cuenta',
  customer: { id: 'c-1', name: 'María Pérez', email: 'maria@example.com', company: 'Acme Studio' },
  status: 'open',
  priority: 'urgent',
  channel: 'email',
  assignee: { id: 'u-1', name: 'Laura Méndez' },
  createdAt: '2026-10-04T10:00:00Z',
  updatedAt: '2026-10-04T10:25:00Z',
}

interface Options {
  selected?: boolean
  selection?: 'all' | 'some' | 'none'
}

function renderTable({ selected = false, selection = 'none' }: Options = {}) {
  const onSelectedChange = vi.fn()
  const onToggleAll = vi.fn()
  const onResolve = vi.fn()
  render(
    <MemoryRouter>
      <TicketTable label="Tickets" selection={{ state: selection, onToggleAll }}>
        <TicketRow
          ticket={ticket}
          to="/tickets/1048"
          selection={{ selected, onChange: onSelectedChange }}
          actions={[{ id: 'resolve', label: 'Marcar como resuelto', onSelect: onResolve }]}
          now={new Date('2026-10-04T10:30:00Z')}
        />
      </TicketTable>
    </MemoryRouter>,
  )
  return { onSelectedChange, onToggleAll, onResolve }
}

describe('TicketTable y TicketRow', () => {
  it('expone una tabla con cabeceras y celdas', () => {
    renderTable()
    const table = screen.getByRole('table', { name: 'Tickets' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'Seleccionar todos los tickets',
      'Asunto / cliente',
      'Estado',
      'Prioridad',
      'Responsable',
      'Actualizado',
      'Acciones',
    ])
    const row = within(table).getAllByRole('row')[1]!
    expect(within(row).getAllByRole('cell')).toHaveLength(7)
    expect(within(row).getByRole('link', { name: '#1048 No puedo acceder a mi cuenta' })).toHaveAttribute(
      'href',
      '/tickets/1048',
    )
    expect(row).toHaveTextContent('María Pérez · Acme Studio')
    expect(row).toHaveTextContent('Abierto')
    expect(row).toHaveTextContent('Urgente')
    expect(within(row).getByText('hace 5 minutos')).toHaveAttribute('datetime', '2026-10-04T10:25:00.000Z')
  })

  it('selecciona un ticket y todos', async () => {
    const { onSelectedChange, onToggleAll } = renderTable({ selection: 'some' })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar ticket #1048' }))
    expect(onSelectedChange).toHaveBeenCalledWith(true)
    const all = screen.getByRole('checkbox', { name: 'Seleccionar todos los tickets' })
    expect(all).toBePartiallyChecked()
    await userEvent.click(all)
    expect(onToggleAll).toHaveBeenCalledOnce()
  })

  it('ofrece las acciones del ticket en un menú con nombre propio', async () => {
    const { onResolve } = renderTable()
    await userEvent.click(screen.getByRole('button', { name: 'Acciones del ticket #1048' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Marcar como resuelto' }))
    expect(onResolve).toHaveBeenCalledOnce()
  })
})

describe('TicketTable sin selección', () => {
  it('omite la columna de selección cuando no hay acciones masivas', () => {
    render(
      <MemoryRouter>
        <TicketTable label="Tickets">
          <TicketRow ticket={ticket} to="/tickets/1048" actions={[]} now={new Date('2026-10-04T10:30:00Z')} />
        </TicketTable>
      </MemoryRouter>,
    )
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(6)
    expect(within(screen.getAllByRole('row')[1]!).getAllByRole('cell')).toHaveLength(6)
  })
})
