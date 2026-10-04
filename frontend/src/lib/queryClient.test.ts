import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { shouldRetry } from './queryClient'

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
