import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Table, TableCell, TableHeaderCell, TableRow } from './Table'

function renderTable(rows = ['Ana', 'Luis']) {
  return render(
    <Table
      label="Equipo"
      caption="Mostrando 2 resultados"
      actionsLabel="Acciones"
      header={
        <>
          <TableHeaderCell area="name">Agente</TableHeaderCell>
          <TableHeaderCell area="status">Estado</TableHeaderCell>
        </>
      }
    >
      {rows.map((name) => (
        <TableRow key={name}>
          <TableCell kind="name">{name}</TableCell>
          <span role="cell">Activo</span>
          <TableCell kind="actions">…</TableCell>
        </TableRow>
      ))}
    </Table>,
  )
}

describe('Table', () => {
  it('expone la semántica de tabla con su nombre y la leyenda como descripción', () => {
    renderTable()
    const table = screen.getByRole('table', { name: 'Equipo' })
    expect(table).toHaveAccessibleDescription('Mostrando 2 resultados')
    expect(screen.getByText('Mostrando 2 resultados')).toBeVisible()
  })

  it('añade al final de la cabecera la columna de acciones, solo para lectores de pantalla', () => {
    renderTable()
    const headers = screen.getAllByRole('columnheader')
    expect(headers.map((header) => header.textContent)).toEqual(['Agente', 'Estado', 'Acciones'])
    expect(within(headers[2]!).getByText('Acciones')).toHaveClass('visually-hidden')
  })

  it('pinta una fila por elemento, además de la de cabecera, con sus celdas', () => {
    renderTable()
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]!).getAllByRole('cell')).toHaveLength(3)
    expect(within(rows[2]!).getByText('Luis')).toBeInTheDocument()
  })

  it('sitúa cada cabecera en su área de la rejilla', () => {
    renderTable()
    expect(screen.getByRole('columnheader', { name: 'Estado' })).toHaveStyle({ gridArea: 'status' })
  })

  it('con la lista vacía deja solo la cabecera', () => {
    renderTable([])
    expect(screen.getAllByRole('row')).toHaveLength(1)
  })
})
