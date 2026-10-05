import { describe, expect, it } from 'vitest'
import * as ui from '../../components/ui'
import rawCatalogSource from './CatalogPage.tsx?raw'

/**
 * Exportaciones de `components/ui` que `/catalogo` no muestra como componente, con su motivo. Cada entrada debe seguir
 * exportada: una excepción obsoleta falla el test.
 */
const exceptions: Record<string, string> = {
  Field: 'Envoltorio interno de etiqueta, ayuda y error; se ve en cada campo (Input, Select, Textarea, Combobox).',
  ToastProvider: 'Se monta una vez en la raíz de la aplicación; el catálogo muestra su efecto con useToast.',
}

/** Sin comentarios JSX ni de bloque o línea: un componente comentado no cuenta como mostrado. */
const catalogSource = rawCatalogSource
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

/** Componentes: exportaciones en PascalCase. Quedan fuera funciones auxiliares y hooks (`buttonClassName`, `useToast`…). */
const components = Object.keys(ui).filter((name) => /^[A-Z]/.test(name))

/** Secciones que el catálogo debe conservar. */
const sections = [
  'Color',
  'Iconos',
  'Botones',
  'Formularios',
  'Avisos y estados',
  'Estados',
  'Superposiciones',
  'Navegación',
  'Estructura',
  'Contenido',
  'Tickets',
  'Tablas',
]

describe('paridad del catálogo con Forma UI', () => {
  it('muestra cada componente exportado, salvo las excepciones declaradas', () => {
    const missing = components.filter(
      (name) => !(name in exceptions) && !new RegExp(`<${name}[\\s/>]`).test(catalogSource),
    )
    expect(missing, `Componentes que faltan en CatalogPage: ${missing.join(', ')}`).toEqual([])
  })

  it('no conserva excepciones de componentes que ya no existen', () => {
    expect(Object.keys(exceptions).filter((name) => !components.includes(name))).toEqual([])
  })

  it('conserva todas las secciones', () => {
    const found = [...catalogSource.matchAll(/<Section title="([^"]+)"/g)].map((match) => match[1])
    expect(found).toEqual(sections)
  })
})
