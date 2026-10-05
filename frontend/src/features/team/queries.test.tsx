import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../test/api'
import { createTestQueryClient } from '../../test/render'
import { reportKeys } from '../reports/queries'
import { ticketKeys } from '../tickets/queries'
import { useChangeRole, useInviteMember, useRemoveMember } from './queries'
import { teamMember } from './teamFixtures'

afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('invalidaciones del resumen desde Equipo', () => {
  const member = teamMember()
  const routes = {
    'POST /api/members': { status: 201, body: member },
    'POST /api/members/u-laura/role': { body: member },
    'POST /api/members/u-laura/remove': { body: { ...member, status: 'removed' } },
  }

  it('invitar invalida el informe y la actividad reciente', async () => {
    mockApi(routes)
    expect(await invalidatedAfter(useInviteMember, { email: 'sofia@acme.example', role: 'agent' })).toEqual({
      reports: true,
      feed: true,
    })
  })

  it('cambiar el rol invalida el informe y la actividad reciente', async () => {
    mockApi(routes)
    expect(await invalidatedAfter(useChangeRole, { userId: 'u-laura', role: 'admin' as const })).toEqual({
      reports: true,
      feed: true,
    })
  })

  it('retirar a un miembro invalida el informe y la actividad reciente', async () => {
    mockApi(routes)
    expect(await invalidatedAfter(useRemoveMember, 'u-laura')).toEqual({ reports: true, feed: true })
  })
})
