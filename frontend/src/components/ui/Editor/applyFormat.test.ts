import { describe, expect, it } from 'vitest'
import { applyFormat } from './applyFormat'

describe('applyFormat', () => {
  it('envuelve la selección en negrita y la mantiene seleccionada', () => {
    expect(applyFormat('Hola María', 5, 10, 'bold')).toEqual({
      value: 'Hola **María**',
      selectionStart: 7,
      selectionEnd: 12,
    })
  })

  it('inserta marcadores vacíos con el cursor en medio', () => {
    expect(applyFormat('Hola ', 5, 5, 'italic')).toEqual({ value: 'Hola __', selectionStart: 6, selectionEnd: 6 })
  })

  it('convierte la selección en enlace y selecciona la URL', () => {
    const edit = applyFormat('Lee la guía', 7, 11, 'link')
    expect(edit.value).toBe('Lee la [guía](https://)')
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe('https://')
  })

  it('convierte en lista cada línea seleccionada sin duplicar viñetas', () => {
    const text = 'Pasos:\nCerrar sesión\n- Borrar caché\nEntrar'
    const start = text.indexOf('Cerrar')
    const edit = applyFormat(text, start, text.length, 'list')
    expect(edit.value).toBe('Pasos:\n- Cerrar sesión\n- Borrar caché\n- Entrar')
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe('Cerrar sesión\n- Borrar caché\n- Entrar')
  })
})
