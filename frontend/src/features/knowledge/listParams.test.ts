import { describe, expect, it } from 'vitest'
import { hasActiveArticleFilters, readArticleListState, writeArticleListState } from './listParams'

describe('listParams', () => {
  it('lee la búsqueda, la categoría, el estado y la página de la URL', () => {
    expect(readArticleListState(new URLSearchParams('q=factura&category=facturacion&status=draft&page=3'))).toEqual({
      q: 'factura',
      category: 'facturacion',
      status: 'draft',
      page: 3,
    })
  })

  it('ignora un estado desconocido y una página no válida', () => {
    const state = readArticleListState(new URLSearchParams('status=archived&page=-2'))
    expect(state).toEqual({ q: '', category: undefined, status: undefined, page: 1 })
  })

  it('solo escribe lo que difiere del estado por defecto', () => {
    expect(writeArticleListState({ q: '  ', page: 1 }).toString()).toBe('')
    expect(writeArticleListState({ q: ' hola ', category: 'a', status: 'published', page: 2 }).toString()).toBe(
      'q=hola&category=a&status=published&page=2',
    )
  })

  it('detecta los filtros activos', () => {
    expect(hasActiveArticleFilters({ q: '', page: 4 })).toBe(false)
    expect(hasActiveArticleFilters({ q: '', category: 'a', page: 1 })).toBe(true)
    expect(hasActiveArticleFilters({ q: ' x', page: 1 })).toBe(true)
    expect(hasActiveArticleFilters({ q: '', status: 'draft', page: 1 })).toBe(true)
  })
})
