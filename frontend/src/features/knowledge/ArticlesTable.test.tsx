import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { ArticlesTable, type ArticlesTableProps } from './ArticlesTable'
import { articleSummary } from './articleFixtures'

function renderTable(props: Partial<ArticlesTableProps> = {}) {
  return render(
    <MemoryRouter>
      <ArticlesTable articles={[articleSummary()]} caption="Mostrando 1 resultado" showStatus {...props} />
    </MemoryRouter>,
  )
}

describe('ArticlesTable', () => {
  it('es una tabla con nombre accesible, columnas y la leyenda como descripción', () => {
    renderTable({ caption: 'Mostrando 2 resultados' })
    const table = screen.getByRole('table', { name: 'Artículos' })
    expect(table).toHaveAccessibleDescription('Mostrando 2 resultados')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Artículo', 'Categoría', 'Estado', 'Actualizado', 'Acciones'])
  })

  it('enlaza el título con el artículo y muestra su categoría y estado', () => {
    renderTable({
      articles: [
        articleSummary(),
        articleSummary({ id: 'a-2', slug: 'borrador', title: 'Notificaciones', status: 'draft' }),
      ],
    })
    expect(screen.getByRole('link', { name: 'Cómo recuperar el acceso a tu cuenta' })).toHaveAttribute(
      'href',
      '/conocimiento/como-recuperar-el-acceso-a-tu-cuenta',
    )
    expect(screen.getAllByRole('cell', { name: 'Cuenta y acceso' })).toHaveLength(2)
    expect(screen.getByText('Publicado')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  it('sin estado (clientes) no hay columna ni insignia de estado', () => {
    renderTable({ showStatus: false })
    const table = screen.getByRole('table', { name: 'Artículos' })
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Artículo', 'Categoría', 'Actualizado', 'Acciones'])
    expect(screen.queryByText('Publicado')).not.toBeInTheDocument()
    expect(screen.queryByText('Borrador')).not.toBeInTheDocument()
  })

  it('un título largo se conserva entero en el enlace', () => {
    const title = 'Una guía extraordinariamente larga sobre cómo configurar todas las notificaciones '.repeat(3).trim()
    renderTable({ articles: [articleSummary({ title })] })
    expect(screen.getByRole('link', { name: title })).toHaveAttribute('title', title)
  })
})
