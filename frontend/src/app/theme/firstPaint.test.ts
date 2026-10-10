import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { themeScript } from '@yelison/forma-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { THEME_STORAGE_KEY } from './theme'

const indexHtml = readFileSync(resolve(import.meta.dirname, '../../../index.html'), 'utf8')

/** Los scripts en línea de la página, con la misma expresión con la que el backend calcula los hashes de la CSP. */
const inlineScripts = (html: string) =>
  [...html.matchAll(/<script(?![^>]*\ssrc\s*=)[^>]*>(.*?)<\/script>/gis)]
    .map(([, body = '']) => body)
    .filter((body) => body.trim())

/** Ejecuta el script como lo haría el navegador al llegar a `<head>`: antes de que exista React. */
function runFirstPaint() {
  const script = document.createElement('script')
  script.textContent = inlineScripts(indexHtml)[0] ?? ''
  document.head.append(script)
  script.remove()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('script de primer pintado de index.html', () => {
  it('es, byte a byte, la salida de themeScript con la clave del almacén (el backend admite su hash en la CSP)', () => {
    expect(inlineScripts(indexHtml)).toEqual([themeScript({ storageKey: THEME_STORAGE_KEY })])
  })

  it('aplica el tema claro guardado aunque el sistema esté en oscuro, antes de que cargue React', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: true, media: query }) as MediaQueryList)
    localStorage.setItem(THEME_STORAGE_KEY, 'light')
    runFirstPaint()
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('aplica el tema oscuro guardado', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    runFirstPaint()
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  it('no fuerza nada con «system», con un valor no válido o sin almacenamiento', () => {
    runFirstPaint()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    runFirstPaint()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(runFirstPaint).not.toThrow()
    expect(document.documentElement).not.toHaveAttribute('data-theme')
  })
})
