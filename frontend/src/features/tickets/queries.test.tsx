import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ticket } from '../../domain/ticket'
import { mockApi } from '../../test/api'
import { createTestQueryClient } from '../../test/render'
import { ticket } from '../../test/ticketFixtures'
import { ticketKeys, useAddMessage, useQuickTicketUpdate } from './queries'

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
  async function addMessage(visibility: 'public' | 'internal') {
    mockApi({ 'POST /api/tickets/1048/messages': { status: 201, body: { id: 'm-1', body: 'Hola', visibility } } })
    const queryClient = createTestQueryClient()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(() => useAddMessage(1048), { wrapper })
    act(() => result.current.mutate({ body: 'Hola', visibility }))
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    return invalidate.mock.calls.map(([filters]) => filters?.queryKey)
  }

  it('una nota interna solo invalida los mensajes del ticket', async () => {
    expect(await addMessage('internal')).toEqual([ticketKeys.messages(1048)])
  })

  it('una respuesta pública invalida detalle, mensajes, listas y métricas', async () => {
    const keys = await addMessage('public')
    expect(keys).toHaveLength(4)
    expect(keys).toEqual(
      expect.arrayContaining([
        ticketKeys.detail(1048),
        ticketKeys.messages(1048),
        ticketKeys.lists(),
        ticketKeys.metrics(),
      ]),
    )
  })
})
