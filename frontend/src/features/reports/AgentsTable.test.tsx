import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgentsTable } from './AgentsTable'
import { reportAgent } from './reportFixtures'

describe('AgentsTable', () => {
  it('es una tabla con sus columnas y una fila por agente', () => {
    render(
      <AgentsTable
        caption="Mostrando 2 agentes"
        agents={[
          reportAgent(),
          reportAgent({ member: { id: 'u-2', name: 'Daniel Santos' }, firstResponseMinutes: null }),
        ]}
      />,
    )
    const table = screen.getByRole('table', { name: 'Rendimiento por agente' })
    expect(table).toHaveAccessibleDescription('Mostrando 2 agentes')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Agente', 'Resueltos', 'Primera respuesta', 'Asignados abiertos', 'Sin acciones'])
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]!).getByText('Laura Méndez')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('15 min')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Sin datos')).toBeInTheDocument()
    // Cada fila tiene tantas celdas como columnas la cabecera.
    for (const row of rows.slice(1)) expect(within(row).getAllByRole('cell')).toHaveLength(5)
  })

  it('marca a quien ya no está en el equipo activo y no al resto', () => {
    render(
      <AgentsTable
        caption=""
        agents={[
          reportAgent(),
          reportAgent({ member: { id: 'u-2', name: 'Pablo Viejo' }, status: 'removed' }),
          reportAgent({ member: { id: 'u-3', name: 'Sofía Ríos' }, status: 'invited' }),
        ]}
      />,
    )
    const [, active, removed, invited] = screen.getAllByRole('row')
    expect(within(active!).queryByText('Retirado')).not.toBeInTheDocument()
    expect(within(active!).queryByText('Invitación pendiente')).not.toBeInTheDocument()
    expect(within(removed!).getByText('Retirado')).toBeInTheDocument()
    expect(within(invited!).getByText('Invitación pendiente')).toBeInTheDocument()
  })
})
