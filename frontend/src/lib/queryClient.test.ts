import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { ApiError, setDemoUser } from '../api/client'
import { sessionKeys } from '../features/session/queries'
import { clearCacheOnDemoUserChange, shouldRetry } from './queryClient'

describe('shouldRetry', () => {
  it('no reintenta errores del cliente', () => {
    expect(shouldRetry(0, new ApiError(404, { status: 404, title: 'No encontrado' }))).toBe(false)
  })

  it('reintenta dos veces fallos de red y del servidor', () => {
    const serverError = new ApiError(503, { status: 503, title: 'No disponible' })
    expect(shouldRetry(0, serverError)).toBe(true)
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true)
    expect(shouldRetry(2, serverError)).toBe(false)
  })
})

describe('clearCacheOnDemoUserChange', () => {
  it('vacía la caché al cambiar el usuario de demostración', () => {
    const queryClient = new QueryClient()
    const stop = clearCacheOnDemoUserChange(queryClient)
    queryClient.setQueryData(sessionKeys.me, { role: 'admin' })
    queryClient.setQueryData(['tickets', 'list'], [])
    expect(queryClient.getQueryCache().getAll()).toHaveLength(2)

    setDemoUser('maria.perez@cliente.example')
    expect(localStorage.getItem('resolve-demo-user')).toBe('maria.perez@cliente.example')
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)

    stop()
    queryClient.setQueryData(sessionKeys.me, { role: 'customer' })
    setDemoUser(null)
    expect(localStorage.getItem('resolve-demo-user')).toBeNull()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(1)
  })
})
