import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { THEME_STORAGE_KEY } from '../../app/theme/theme'
import { AppearanceTab } from './AppearanceTab'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('AppearanceTab', () => {
  it('ofrece claro, oscuro y sistema en un grupo con nombre, y dice dónde se guarda', () => {
    render(<AppearanceTab />)
    const group = screen.getByRole('group', { name: 'Tema' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio').map((radio) => radio.closest('label')?.textContent)).toEqual([
      'Claro',
      'Oscuro',
      'Usar el del sistema',
    ])
    expect(screen.getByText('Esta preferencia se guarda en este navegador.')).toBeInTheDocument()
  })

  it('sin preferencia guardada marca «sistema»', () => {
    render(<AppearanceTab />)
    expect(screen.getByRole('radio', { name: 'Usar el del sistema' })).toBeChecked()
  })

  it('elegir oscuro aplica el tema y lo recuerda en este navegador', async () => {
    render(<AppearanceTab />)
    await userEvent.click(screen.getByRole('radio', { name: 'Oscuro' }))
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('volver a «sistema» quita la preferencia guardada', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(<AppearanceTab />)
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
    await userEvent.click(screen.getByRole('radio', { name: 'Usar el del sistema' }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })

  it('se maneja con teclado: las flechas cambian la opción', async () => {
    render(<AppearanceTab />)
    await userEvent.click(screen.getByRole('radio', { name: 'Claro' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Oscuro' })).toBeChecked()
  })
})
