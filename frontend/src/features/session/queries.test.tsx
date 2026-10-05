import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestQueryClient } from '../../test/render'
import { ME_TIMEOUT_MS, useMe } from './queries'

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

describe('useMe', () => {
  afterEach(() => {
    vi.restoreAllMocks()
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
})
