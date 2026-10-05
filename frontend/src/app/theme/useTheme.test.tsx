import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from './theme'
import { useTheme } from './useTheme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  vi.restoreAllMocks()
})

describe('useTheme', () => {
  it('sigue al sistema por defecto sin forzar atributo', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('system')
    expect(result.current.resolved).toBe('light')
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('alterna, aplica y recuerda la preferencia', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(result.current.resolved).toBe('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('restaura la preferencia guardada y vuelve al sistema', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('dark')
    act(() => result.current.setPreference('system'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('ignora valores guardados no válidos', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    const { result } = renderHook(() => useTheme())
    expect(result.current.preference).toBe('system')
  })

  it('comparte la preferencia entre consumidores: cambiar en uno se refleja en el otro', () => {
    const shell = renderHook(() => useTheme())
    const appearance = renderHook(() => useTheme())
    act(() => appearance.result.current.setPreference('dark'))
    expect(shell.result.current.preference).toBe('dark')
    expect(shell.result.current.resolved).toBe('dark')
    // El botón del topbar, desde el otro consumidor, parte del tema que se ve y cambia a claro al primer clic.
    act(() => shell.result.current.toggle())
    expect(appearance.result.current.preference).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('sigue el cambio de la preferencia guardada desde otra pestaña', () => {
    const { result } = renderHook(() => useTheme())
    act(() => {
      localStorage.setItem(THEME_STORAGE_KEY, 'dark')
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }))
    })
    expect(result.current.preference).toBe('dark')
  })

  it('sin almacenamiento la elección dura la sesión y también se comparte', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    const first = renderHook(() => useTheme())
    const second = renderHook(() => useTheme())
    act(() => first.result.current.setPreference('dark'))
    expect(second.result.current.preference).toBe('dark')
    vi.restoreAllMocks()
    // Al volver a haber almacenamiento, lo guardado manda de nuevo.
    act(() => first.result.current.setPreference('system'))
    expect(second.result.current.preference).toBe('system')
  })
})
