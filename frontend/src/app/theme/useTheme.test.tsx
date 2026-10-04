import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from './theme'
import { useTheme } from './useTheme'

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
})
