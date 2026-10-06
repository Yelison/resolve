import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PermissionsMatrix } from './PermissionsMatrix'
import { accessLabels, capabilities } from './permissions'

describe('PermissionsMatrix', () => {
  it('lista cada capacidad de permissions.ts con sus cuatro columnas', () => {
    render(<PermissionsMatrix />)
    const table = screen.getByRole('table')
    const headers = within(table).getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual(['Capacidad', 'Administrador', 'Agente', 'Cliente'])
    for (const capability of capabilities) {
      expect(within(table).getByRole('rowheader', { name: new RegExp(`^${capability.label}`) })).toBeInTheDocument()
    }
  })

  it('agrupa las capacidades por sección', () => {
    render(<PermissionsMatrix />)
    const table = screen.getByRole('table')
    const sectionHeaders = within(table)
      .getAllByRole('rowheader')
      .filter((header) => header.getAttribute('scope') === 'rowgroup')
    expect(sectionHeaders.map((header) => header.textContent)).toEqual([
      'Tickets',
      'Clientes',
      'Equipo',
      'Reportes',
      'Conocimiento',
      'Configuración',
    ])
  })

  it('dice el acceso con texto, no solo con color o icono', () => {
    render(<PermissionsMatrix />)
    const row = screen.getByRole('rowheader', { name: /^Invitar, cambiar el rol y retirar miembros/ }).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells.map((cell) => cell.textContent)).toEqual([
      `Administrador${accessLabels.allowed}`,
      `Agente${accessLabels.no}`,
      `Cliente${accessLabels.no}`,
    ])
  })

  it('es informativa: sin aviso de validación en el servidor y sin ofrecer guardar', () => {
    render(<PermissionsMatrix />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/servidor/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(`Mostrando ${capabilities.length} capacidades`)).toBeInTheDocument()
  })
})
