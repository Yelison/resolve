import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { adminMe, mockApi } from '../../test/api'
import { createTestQueryClient } from '../../test/render'
import { shouldRetry } from '../../lib/queryClient'
import { ME_TIMEOUT_MS, retryUnlessTimeout, sessionKeys, useMe } from './queries'

const queryClient = createTestQueryClient()

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useMe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    queryClient.clear()
  })

  it('aborta /me al agotar el tiempo límite y lo deja como error (no como carga eterna)', async () => {
    const timeout = new AbortController()
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeout.signal)
    // El servidor nunca responde: solo la señal de la petición puede terminarla.
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input) =>
        new Promise((_, reject) => {
          const { signal } = input as Request
          signal.addEventListener('abort', () => reject(signal.reason))
        }),
    )

    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('fetching'))
    expect(timeoutSpy).toHaveBeenCalledWith(ME_TIMEOUT_MS)

    timeout.abort(new DOMException('Tiempo agotado', 'TimeoutError'))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ name: 'TimeoutError' })
  })

  it('cancelar la consulta aborta la petición (la señal de la consulta se combina con el plazo)', async () => {
    let requestSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input) =>
        new Promise((_, reject) => {
          const { signal } = input as Request
          requestSignal = signal
          signal.addEventListener('abort', () => reject(signal.reason))
        }),
    )

    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('fetching'))
    expect(requestSignal?.aborted).toBe(false)

    await queryClient.cancelQueries({ queryKey: sessionKeys.me })
    expect(requestSignal?.aborted).toBe(true)
  })

  it('sin AbortSignal.any (navegadores antiguos) /me responde y la sesión carga', async () => {
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(Object.create(AbortSignal), { any: undefined, timeout: AbortSignal.timeout }),
    )
    mockApi({ 'GET /api/me': { body: adminMe } })

    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data?.user.name).toBe('Yelisson Ortiz'))
  })

  it('sin AbortSignal.any, cancelar la consulta también aborta la petición', async () => {
    vi.stubGlobal(
      'AbortSignal',
      Object.assign(Object.create(AbortSignal), { any: undefined, timeout: AbortSignal.timeout }),
    )
    let requestSignal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (input) =>
        new Promise((_, reject) => {
          const { signal } = input as Request
          requestSignal = signal
          signal.addEventListener('abort', () => reject(signal.reason))
        }),
    )

    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.fetchStatus).toBe('fetching'))
    await queryClient.cancelQueries({ queryKey: sessionKeys.me })
    expect(requestSignal?.aborted).toBe(true)
  })

  it('no reintenta un TimeoutError y sí los 5xx y los fallos de red', () => {
    const retryMe = retryUnlessTimeout(shouldRetry)
    const timeout = new DOMException('Tiempo agotado', 'TimeoutError')
    expect(retryMe(0, timeout)).toBe(false)
    expect(retryMe(0, new ApiError(500, { status: 500, title: 'Error interno' }))).toBe(true)
    expect(retryMe(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retryMe(2, new TypeError('Failed to fetch'))).toBe(false)
  })

  it('tras un TimeoutError la consulta falla sin esperar a un reintento', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('Tiempo agotado', 'TimeoutError'))
    queryClient.setDefaultOptions({ queries: { retry: shouldRetry, gcTime: Infinity } })
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
