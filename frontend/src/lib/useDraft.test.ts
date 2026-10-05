import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDraft } from './useDraft'

describe('useDraft', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('empieza vacío y guarda lo que se escribe bajo su clave', () => {
    const { result } = renderHook(() => useDraft('k'))
    expect(result.current[0]).toBe('')
    act(() => result.current[1]('hola'))
    expect(sessionStorage.getItem('k')).toBe('hola')
  })

  it('recupera el borrador guardado al montar de nuevo', () => {
    sessionStorage.setItem('k', 'pendiente')
    const { result } = renderHook(() => useDraft('k'))
    expect(result.current[0]).toBe('pendiente')
  })

  it('borra la clave al vaciar el borrador', () => {
    sessionStorage.setItem('k', 'pendiente')
    const { result } = renderHook(() => useDraft('k'))
    act(() => result.current[1](''))
    expect(sessionStorage.getItem('k')).toBeNull()
  })

  it('sigue en memoria si el almacenamiento está bloqueado', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const { result } = renderHook(() => useDraft('k'))
    act(() => result.current[1]('en memoria'))
    expect(result.current[0]).toBe('en memoria')
  })
})
