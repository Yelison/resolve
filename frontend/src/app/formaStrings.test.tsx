import { defaultStrings, useFormaStrings } from '@yelison/forma-ui'
import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from '../components/ui'
import { renderWithProviders } from '../test/render'
import { formaStrings } from './formaStrings'

/* Los textos que los componentes de @yelison/forma-ui muestran por su cuenta vienen en inglés. Resolve instala un
 * FormaProvider con todos en español (ADR 0002) y este archivo los fija uno a uno. */

/** Lo que el paquete muestra por su cuenta, en español: añadir una clave al paquete obliga a añadir su fila aquí. */
const spanish: Record<keyof typeof defaultStrings, string> = {
  buttonLoading: 'Enviando…',
  dialogClose: 'Cerrar',
}

function Strings() {
  return <output>{JSON.stringify(useFormaStrings())}</output>
}

describe('textos de @yelison/forma-ui en español', () => {
  it('cada texto incorporado tiene su valor en español, y los de Resolve son exactamente estos', () => {
    expect(formaStrings).toEqual(spanish)
  })

  it('no falta ninguna clave del paquete ni sobra ninguna, y ninguna se queda en inglés', () => {
    // Falla si una versión futura añade una clave a `FormaStrings` sin su valor en español.
    expect(Object.keys(formaStrings).sort()).toEqual(Object.keys(defaultStrings).sort())
    for (const key of Object.keys(defaultStrings) as (keyof typeof defaultStrings)[]) {
      expect(formaStrings[key], key).toBeTruthy()
      expect(formaStrings[key], `${key} sigue en inglés`).not.toBe(defaultStrings[key])
    }
  })

  it('un botón cargando dentro del proveedor de Resolve se llama «Enviando…»', () => {
    renderWithProviders(<Button loading>Guardar</Button>)
    expect(screen.getByRole('button', { name: 'Enviando…' })).toHaveAttribute('aria-busy', 'true')
  })

  it('el texto propio de un botón gana al del proveedor', () => {
    renderWithProviders(
      <Button loading loadingLabel="Guardando…">
        Guardar
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Guardando…' })).toBeInTheDocument()
  })

  it('la aplicación entrega al resto de componentes los textos de Resolve (dialogClose incluido)', () => {
    renderWithProviders(<Strings />)
    expect(JSON.parse(screen.getByRole('status').textContent)).toEqual(spanish)
  })
})
