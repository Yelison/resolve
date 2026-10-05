import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, mockApi } from '../../test/api'
import { createTestQueryClient } from '../../test/render'
import { useTimeZone } from './useTimeZone'

function renderTimeZone() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return renderHook(() => useTimeZone(), { wrapper })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useTimeZone', () => {
  it('usa la zona del navegador mientras /me carga y después la de la organización', async () => {
    mockApi({
      'GET /api/me': {
        body: { ...adminMe, organization: { ...adminMe.organization, timeZone: 'America/Mexico_City' } },
      },
    })
    const { result } = renderTimeZone()
    expect(result.current).toBe('UTC')
    await waitFor(() => expect(result.current).toBe('America/Mexico_City'))
  })

  it('mantiene la zona del navegador si /me falla', async () => {
    const fetchSpy = mockApi({ 'GET /api/me': { status: 500, body: { title: 'Error' } } })
    const { result } = renderTimeZone()
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    expect(result.current).toBe('UTC')
  })
})
