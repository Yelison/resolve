import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'
import { pageRange } from './pageRange'

describe('pageRange', () => {
  it.each([
    [1, 0, []],
    [1, 5, [1, 2, 3, 4, 5]],
    [1, 7, [1, 2, 3, 4, 5, 6, 7]],
    [4, 8, [1, 'gap', 3, 4, 5, 'gap', 8]],
    [5, 8, [1, 'gap', 4, 5, 6, 'gap', 8]],
    [5, 9, [1, 'gap', 4, 5, 6, 'gap', 9]],
    [Number.NaN, 9, [1, 2, 3, 4, 5, 'gap', 9]],
    [1, 20, [1, 2, 3, 4, 5, 'gap', 20]],
    [6, 20, [1, 'gap', 5, 6, 7, 'gap', 20]],
    [20, 20, [1, 'gap', 16, 17, 18, 19, 20]],
    [99, 20, [1, 'gap', 16, 17, 18, 19, 20]],
  ])('página %i de %i', (page, count, expected) => {
    expect(pageRange(page, count)).toEqual(expected)
  })

  it('mantiene siempre el mismo número de posiciones', () => {
    for (let page = 1; page <= 30; page++) expect(pageRange(page, 30)).toHaveLength(7)
  })
})

describe('Pagination', () => {
  it('resume el rango y marca la página actual', () => {
    render(<Pagination page={1} pageSize={5} total={24} onPageChange={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Paginación' })).toHaveTextContent('1–5 de 24 resultados')
    expect(screen.getByRole('button', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  })

  it('avisa del cambio de página', async () => {
    const onPageChange = vi.fn()
    render(<Pagination page={2} pageSize={5} total={24} onPageChange={onPageChange} />)
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Página 5' }))
    expect(onPageChange.mock.calls).toEqual([[3], [5]])
  })

  it('ajusta una página fuera de rango', () => {
    render(<Pagination page={9} pageSize={5} total={24} onPageChange={() => {}} />)
    expect(screen.getByText('21–24 de 24 resultados')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 5' })).toHaveAttribute('aria-current', 'page')
  })

  it('concuerda «resultado» en singular con un solo resultado', () => {
    render(<Pagination page={1} pageSize={10} total={1} onPageChange={() => {}} />)
    expect(screen.getByText('1–1 de 1 resultado')).toBeInTheDocument()
  })

  it('omite los botones cuando todo cabe en una página', () => {
    render(<Pagination page={1} pageSize={10} total={3} onPageChange={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('1–3 de 3 resultados')).toBeInTheDocument()
  })

  it('cuenta lo que se le indica en `unit`, con su singular y su plural', () => {
    const unit = { one: 'empresa', many: 'empresas' }
    const { rerender } = render(<Pagination page={1} pageSize={8} total={38} unit={unit} onPageChange={() => {}} />)
    expect(screen.getByText('1–8 de 38 empresas')).toBeInTheDocument()
    rerender(<Pagination page={1} pageSize={8} total={1} unit={unit} onPageChange={() => {}} />)
    expect(screen.getByText('1–1 de 1 empresa')).toBeInTheDocument()
  })
})
