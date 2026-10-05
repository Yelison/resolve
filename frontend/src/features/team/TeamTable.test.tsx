import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TeamTable } from './TeamTable'
import { teamMember } from './teamFixtures'

describe('TeamTable', () => {
  it('es una tabla con sus columnas y una fila por miembro', () => {
    render(
      <TeamTable
        caption="Mostrando 2 miembros"
        members={[
          teamMember(),
          teamMember({ id: 'u-daniel', name: 'Daniel Santos', role: 'admin', status: 'invited', openTickets: 1 }),
        ]}
      />,
    )
    const table = screen.getByRole('table', { name: 'Equipo' })
    expect(table).toHaveAccessibleDescription('Mostrando 2 miembros')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Agente', 'Rol', 'Estado', 'Carga', 'Acción'])
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]!).getByText('Laura Méndez')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Agente')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Activo')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('3 abiertos')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Administrador')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Invitación pendiente')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('1 abierto')).toBeInTheDocument()
  })

  it('marca a los retirados', () => {
    render(<TeamTable caption="" members={[teamMember({ status: 'removed' })]} />)
    expect(screen.getByText('Retirado')).toBeInTheDocument()
  })

  it('sin acciones no dibuja el menú', () => {
    render(<TeamTable caption="" members={[teamMember()]} />)
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument()
  })

  it('el menú de cada fila lleva el nombre del miembro y ejecuta la acción elegida', async () => {
    const onSelect = vi.fn()
    render(
      <TeamTable
        caption=""
        members={[teamMember()]}
        actions={() => [{ id: 'role', label: 'Cambiar rol', onSelect }]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Laura Méndez' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cambiar rol' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })
})
