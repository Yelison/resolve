import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { act, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../test/api'
import { createTestQueryClient } from '../../test/render'
import { articlePage, articleSummary } from '../knowledge/articleFixtures'
import { page, summary } from '../../test/ticketFixtures'
import { sessionKeys } from '../session/queries'
import { SEARCH_DEBOUNCE_MS, SEARCH_GROUP_SIZE, useGlobalSearch } from './useGlobalSearch'

const customerPage = (items: unknown[] = []) => ({
  items,
  page: 0,
  size: 5,
  totalItems: items.length,
  totalPages: items.length ? 1 : 0,
})

const all = ['tickets', 'customers', 'articles'] as const

function setup(initial: { text: string; allowed?: readonly ('tickets' | 'customers' | 'articles')[] }) {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const view = renderHook(({ text, allowed }) => useGlobalSearch(text, allowed), {
    wrapper,
    initialProps: { text: initial.text, allowed: initial.allowed ?? all },
  })
  return { ...view, queryClient }
}

/** Dirección de una llamada a `fetch`: openapi-fetch pasa un `Request`. */
const urlOf = ([input]: Parameters<typeof fetch>) => new URL(input instanceof Request ? input.url : String(input))

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)))

describe('useGlobalSearch', () => {
  afterEach(() => vi.restoreAllMocks())

  it('espera a que se deje de escribir y pide cada grupo una sola vez con el tamaño pequeño', async () => {
    const spy = mockApi({
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/customers': { body: customerPage() },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const { result, rerender } = setup({ text: '' })
    rerender({ text: 'cu', allowed: all })
    rerender({ text: 'cue', allowed: all })
    await wait(SEARCH_DEBOUNCE_MS / 2)
    expect(spy).not.toHaveBeenCalled()
    expect(result.current.settled).toBe(false)

    await waitFor(() => expect(result.current.tickets.status).toBe('success'))
    expect(result.current.settled).toBe(true)
    const urls = spy.mock.calls.map(urlOf)
    expect(
      urls.map((url) => `${url.pathname}?q=${url.searchParams.get('q')}&size=${url.searchParams.get('size')}`),
    ).toEqual(
      expect.arrayContaining([
        `/api/tickets?q=cue&size=${SEARCH_GROUP_SIZE}`,
        `/api/customers?q=cue&size=${SEARCH_GROUP_SIZE}`,
        `/api/knowledge/articles?q=cue&size=${SEARCH_GROUP_SIZE}`,
      ]),
    )
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('no busca con menos de dos caracteres y deja los grupos en reposo', async () => {
    const spy = mockApi({})
    const { result } = setup({ text: ' a ' })
    await wait(SEARCH_DEBOUNCE_MS + 50)
    expect(spy).not.toHaveBeenCalled()
    expect(result.current.term).toBe('')
    expect(result.current.tickets.status).toBe('idle')
  })

  it('solo pide los grupos permitidos: un rol sin clientes no los consulta', async () => {
    const spy = mockApi({
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const { result } = setup({ text: 'cuenta', allowed: ['tickets', 'articles'] })
    await waitFor(() => expect(result.current.articles.status).toBe('success'))
    expect(spy.mock.calls.map((call) => urlOf(call).pathname)).not.toContain('/api/customers')
    expect(result.current.customers.status).toBe('idle')
  })

  it('agrupa los resultados y el total de cada grupo, no solo lo que cabe', async () => {
    mockApi({
      'GET /api/tickets': { body: page([summary(), summary({ id: 't-2', number: 1049 })], 12) },
      'GET /api/customers': { body: customerPage() },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const { result } = setup({ text: 'cuenta' })
    await waitFor(() => expect(result.current.customers.status).toBe('success'))
    await waitFor(() => expect(result.current.tickets.status).toBe('success'))
    expect(result.current.tickets.items.map((ticket) => ticket.number)).toEqual([1048, 1049])
    expect(result.current.tickets.total).toBe(12)
    expect(result.current.customers.items).toEqual([])
    expect(result.current.articles.total).toBe(1)
  })

  it('un grupo que falla no oculta a los demás y se puede reintentar', async () => {
    let fail = true
    mockApi({
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/customers': () =>
        fail ? { status: 500, body: { status: 500, title: 'Error' } } : { body: customerPage() },
      'GET /api/knowledge/articles': { body: articlePage([articleSummary()]) },
    })
    const { result } = setup({ text: 'cuenta' })
    await waitFor(() => expect(result.current.customers.status).toBe('error'))
    expect(result.current.tickets.status).toBe('success')
    expect(result.current.articles.status).toBe('success')

    fail = false
    act(() => result.current.customers.retry())
    await waitFor(() => expect(result.current.customers.status).toBe('success'))
  })

  it('un 403 no es un resultado ni un error: el grupo se oculta y se relee la sesión', async () => {
    mockApi({
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/customers': { status: 403, body: { status: 403, title: 'Prohibido' } },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    const { result, queryClient } = setup({ text: 'cuenta' })
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await waitFor(() => expect(result.current.customers.status).toBe('forbidden'))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: sessionKeys.me }))
    expect(result.current.tickets.status).toBe('success')
  })

  it('al cambiar el texto cancela las peticiones anteriores y descarta sus respuestas', async () => {
    const signals: AbortSignal[] = []
    const answers: Record<string, ReturnType<typeof page>> = {
      cue: page([summary({ id: 't-old', number: 1, subject: 'Respuesta vieja' })]),
      cuenta: page([summary({ id: 't-new', number: 2, subject: 'Respuesta nueva' })]),
    }
    mockApi({
      'GET /api/tickets': async (request) => {
        signals.push(request.signal)
        const q = new URL(request.url).searchParams.get('q')!
        // La búsqueda vieja tarda más que la nueva: si se aceptara su respuesta, pisaría a la nueva.
        await new Promise((resolve) => setTimeout(resolve, q === 'cue' ? 400 : 20))
        return { body: answers[q] }
      },
      'GET /api/customers': { body: customerPage() },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    const { result, rerender } = setup({ text: 'cue' })
    await waitFor(() => expect(signals).toHaveLength(1), { timeout: 2000 })
    rerender({ text: 'cuenta', allowed: all })
    await waitFor(() => expect(signals).toHaveLength(2), { timeout: 2000 })
    await waitFor(() => expect(result.current.tickets.items[0]?.subject).toBe('Respuesta nueva'))
    expect(signals[0]!.aborted).toBe(true)
    await wait(500)
    expect(result.current.tickets.items[0]?.subject).toBe('Respuesta nueva')
  })

  it('mientras el campo no coincide con la consulta, los resultados en pantalla son de un texto anterior', async () => {
    mockApi({
      'GET /api/tickets': { body: page([summary()]) },
      'GET /api/customers': { body: customerPage() },
      'GET /api/knowledge/articles': { body: articlePage([]) },
    })
    const { result, rerender } = setup({ text: 'ab' })
    await waitFor(() => expect(result.current.tickets.status).toBe('success'))
    expect(result.current.tickets.stale).toBe(false)

    // Borrar y escribir otra cosa antes de que acabe la espera: la consulta sigue siendo la de «ab».
    rerender({ text: 'a', allowed: all })
    rerender({ text: '', allowed: all })
    rerender({ text: 'xy', allowed: all })
    expect(result.current.settled).toBe(false)
    expect(result.current.tickets.status).toBe('success')
    expect(result.current.tickets.items).toHaveLength(1)
    expect(result.current.tickets.stale).toBe(true)
  })
})
