import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ticket } from '../../domain/ticket'
import { mockApi } from '../../test/api'
import { createTestQueryClient } from '../../test/render'
import { ticket } from '../../test/ticketFixtures'
import { reportKeys } from '../reports/queries'
import {
  ticketKeys,
  useAddMessage,
  useCreateTicket,
  useQuickTicketUpdate,
  useRecentActivity,
  useTicket,
  useTicketList,
  useTicketMessages,
  useTicketMetrics,
  useUpdateTicket,
} from './queries'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useQuickTicketUpdate', () => {
  it('un refetch del detalle en vuelo no pisa la respuesta del PATCH', async () => {
    let reads = 0
    mockApi({
      'GET /api/tickets/1048': async () => {
        reads += 1
        // La segunda lectura es un refetch lento que el servidor resolvió antes del cambio.
        if (reads > 1) await new Promise((resolve) => setTimeout(resolve, 200))
        return { body: ticket({ version: 0 }) }
      },
      'PATCH /api/tickets/1048': { body: ticket({ status: 'in_progress', version: 1 }) },
    })
    const queryClient = createTestQueryClient()
    const key = ticketKeys.detail(1048)
    // Justo cuando la mutación termina de leer la versión, otro observador relanza el detalle (por ejemplo, por foco).
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success' && reads === 1) {
        void queryClient.refetchQueries({ queryKey: key, exact: true })
      }
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useQuickTicketUpdate(), { wrapper })

    act(() => result.current.mutate({ number: 1048, changes: { status: 'in_progress' } }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    unsubscribe()
    expect(reads).toBe(2)
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(queryClient.getQueryData<Ticket>(key)).toMatchObject({ status: 'in_progress', version: 1 })
    // La lectura tardía se canceló: solo escribieron la lectura de la versión y el PATCH.
    expect(queryClient.getQueryState(key)?.dataUpdateCount).toBe(2)
  })
})

describe('useAddMessage', () => {
  /** Peticiones de lectura que provoca una respuesta, con detalle, mensajes, una lista y las métricas montados. */
  async function readsAfterAdding(visibility: 'public' | 'internal') {
    const reads: Record<string, number> = {}
    const read = (path: string, body: unknown) => () => {
      reads[path] = (reads[path] ?? 0) + 1
      return { body }
    }
    mockApi({
      'GET /api/tickets/1048': read('detail', ticket()),
      'GET /api/tickets/1048/messages': read('messages', []),
      'GET /api/tickets': read('list', { items: [], page: 0, size: 20, totalItems: 0, totalPages: 0 }),
      'GET /api/tickets/metrics': read('metrics', {}),
      'POST /api/tickets/1048/messages': { status: 201, body: { id: 'm-1', body: 'Hola', visibility } },
    })
    const queryClient = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => {
        useTicket(1048)
        useTicketMessages(1048)
        useTicketList({ view: 'all', status: [], priority: [], page: 1, pageSize: 20, sort: 'updated' })
        useTicketMetrics()
        return useAddMessage(1048)
      },
      { wrapper },
    )
    await waitFor(() => expect(Object.keys(reads)).toHaveLength(4))
    const before = { ...reads }
    act(() => result.current.mutate({ body: 'Hola', visibility }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 100))
    return Object.fromEntries(Object.entries(reads).map(([path, count]) => [path, count - (before[path] ?? 0)]))
  }

  it('una nota interna solo vuelve a pedir los mensajes del ticket', async () => {
    expect(await readsAfterAdding('internal')).toEqual({ detail: 0, messages: 1, list: 0, metrics: 0 })
  })

  it('una respuesta pública vuelve a pedir detalle, mensajes, lista y métricas, una vez cada uno', async () => {
    expect(await readsAfterAdding('public')).toEqual({ detail: 1, messages: 1, list: 1, metrics: 1 })
  })
})

describe('invalidaciones del resumen', () => {
  /** Cuáles de las claves del resumen (informe y actividad reciente) quedan invalidadas tras ejecutar la mutación. */
  async function invalidatedAfter<TVariables>(
    useMutationUnderTest: () => { mutate: (variables: TVariables) => void; isSuccess: boolean },
    variables: TVariables,
  ) {
    const queryClient = createTestQueryClient()
    queryClient.setQueryData(reportKeys.summary('7d'), {})
    queryClient.setQueryData(ticketKeys.recent(10), [])
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(useMutationUnderTest, { wrapper })
    act(() => result.current.mutate(variables))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    return {
      reports: queryClient.getQueryState(reportKeys.summary('7d'))?.isInvalidated,
      feed: queryClient.getQueryState(ticketKeys.recent(10))?.isInvalidated,
    }
  }

  const routes = {
    'POST /api/tickets': { status: 201, body: ticket({ number: 1049 }) },
    'GET /api/tickets/1048': { body: ticket({ version: 3 }) },
    'PATCH /api/tickets/1048': { body: ticket({ status: 'resolved', version: 4 }) },
    'POST /api/tickets/1048/messages': { status: 201, body: { id: 'm-1' } },
  }

  it('crear un ticket invalida el informe y la actividad reciente', async () => {
    mockApi(routes)
    const newTicket = { customerId: 'c-maria', subject: 'Hola', description: '', priority: 'low' as const }
    expect(await invalidatedAfter(useCreateTicket, { ...newTicket, assigneeId: null })).toEqual({
      reports: true,
      feed: true,
    })
  })

  it('cambiar un ticket desde su página invalida el informe y la actividad reciente', async () => {
    mockApi(routes)
    expect(
      await invalidatedAfter(() => useUpdateTicket(1048), { version: 3, changes: { status: 'resolved' } }),
    ).toEqual({ reports: true, feed: true })
  })

  it('cambiar un ticket desde la bandeja invalida el informe y la actividad reciente', async () => {
    mockApi(routes)
    expect(await invalidatedAfter(useQuickTicketUpdate, { number: 1048, changes: { status: 'resolved' } })).toEqual({
      reports: true,
      feed: true,
    })
  })

  it('una respuesta pública invalida el informe, pero no la actividad (no escribe en el historial)', async () => {
    mockApi(routes)
    expect(await invalidatedAfter(() => useAddMessage(1048), { body: 'Hola', visibility: 'public' as const })).toEqual({
      reports: true,
      feed: false,
    })
  })

  it('una nota interna no invalida ni el informe ni la actividad', async () => {
    mockApi(routes)
    expect(
      await invalidatedAfter(() => useAddMessage(1048), { body: 'Nota', visibility: 'internal' as const }),
    ).toEqual({ reports: false, feed: false })
  })
})

describe('useRecentActivity', () => {
  it('pide el tamaño indicado y lo guarda en la clave', async () => {
    const spy = mockApi({ 'GET /api/tickets/activity': { body: [] } })
    const queryClient = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useRecentActivity(10), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(new URL((spy.mock.calls[0]![0] as Request).url).searchParams.get('size')).toBe('10')
    expect(queryClient.getQueryState(ticketKeys.recent(10))?.status).toBe('success')
  })
})
