import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { memberKeys } from '../team/queries'
import { customerKeys } from './queries'

describe('claves de caché de clientes y miembros', () => {
  it('invalidar customerKeys.all alcanza búsquedas, listas y detalle, pero no a los miembros', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(customerKeys.search('ma'), 1)
    queryClient.setQueryData(customerKeys.list({ page: 1, pageSize: 20 }), 2)
    queryClient.setQueryData(customerKeys.detail('c-1'), 3)
    queryClient.setQueryData(memberKeys.assignees(), 4)
    await queryClient.invalidateQueries({ queryKey: customerKeys.all })
    const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated
    expect(stale(customerKeys.search('ma'))).toBe(true)
    expect(stale(customerKeys.list({ page: 1, pageSize: 20 }))).toBe(true)
    expect(stale(customerKeys.detail('c-1'))).toBe(true)
    expect(stale(memberKeys.assignees())).toBe(false)
  })

  it('memberKeys.all incluye los responsables asignables', async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(memberKeys.assignees(), 1)
    await queryClient.invalidateQueries({ queryKey: memberKeys.all })
    expect(queryClient.getQueryState(memberKeys.assignees())?.isInvalidated).toBe(true)
  })
})
