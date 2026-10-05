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

describe('applyFormat · heading', () => {
  it('antepone «## » a la línea del cursor y desplaza la selección', () => {
    expect(applyFormat('uno\ndos', 5, 6, 'heading')).toEqual({
      value: 'uno\n## dos',
      selectionStart: 8,
      selectionEnd: 9,
    })
  })

  it('quita «## » si la línea ya es un encabezado', () => {
    expect(applyFormat('## uno', 4, 4, 'heading')).toEqual({ value: 'uno', selectionStart: 1, selectionEnd: 1 })
  })
})

describe('applyFormat · heading (varias líneas y otros niveles)', () => {
  it('sustituye cualquier prefijo # por «## » en lugar de apilarlo', () => {
    expect(applyFormat('### Detalle', 5, 5, 'heading').value).toBe('## Detalle')
    expect(applyFormat('# Uno', 0, 0, 'heading').value).toBe('## Uno')
    expect(applyFormat('###### Seis', 0, 0, 'heading').value).toBe('## Seis')
  })

  it('actúa en todas las líneas seleccionadas y la misma porción sigue seleccionada', () => {
    const edit = applyFormat('uno\ndos\ntres', 1, 10, 'heading')
    expect(edit.value).toBe('## uno\n## dos\n## tres')
    // «no\ndos\ntr» pasa a «no\n## dos\n## tr».
    expect(edit.value.slice(edit.selectionStart, edit.selectionEnd)).toBe('no\n## dos\n## tr')
  })

  it('quita el prefijo de todas las líneas si todas son ya «## »', () => {
    expect(applyFormat('## uno\n## dos', 0, 13, 'heading').value).toBe('uno\ndos')
  })

  it('si solo algunas lo son, las iguala todas a «## » sin duplicarlo', () => {
    expect(applyFormat('## uno\ndos', 0, 10, 'heading').value).toBe('## uno\n## dos')
  })

  it('no toca las líneas fuera de la selección', () => {
    expect(applyFormat('a\nb\nc', 2, 3, 'heading').value).toBe('a\n## b\nc')
  })

  it('salta las líneas vacías de la selección', () => {
    expect(applyFormat('uno\n\ndos', 0, 8, 'heading').value).toBe('## uno\n\n## dos')
    expect(applyFormat('## uno\n\n## dos', 0, 14, 'heading').value).toBe('uno\n\ndos')
  })

  it('una selección que termina al inicio de una línea no incluye esa línea', () => {
    const edit = applyFormat('uno\ndos\ntres', 0, 8, 'heading')
    expect(edit.value).toBe('## uno\n## dos\ntres')
    expect(edit.selectionEnd).toBe(8 + 6)
  })

  it('con el cursor sin selección al inicio de una línea sigue convirtiéndola', () => {
    expect(applyFormat('uno\ndos', 4, 4, 'heading').value).toBe('uno\n## dos')
  })
})
