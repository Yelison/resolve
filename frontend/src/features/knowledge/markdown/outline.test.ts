import { describe, expect, it } from 'vitest'
import { outline } from './outline'

describe('outline', () => {
  it('lista los encabezados ## y ### en orden, con sus niveles', () => {
    expect(outline('Intro\n\n## Primero\n\ntexto\n\n### Sub\n\n## Segundo')).toEqual([
      { id: 'primero', level: 2, text: 'Primero' },
      { id: 'sub', level: 3, text: 'Sub' },
      { id: 'segundo', level: 2, text: 'Segundo' },
    ])
  })

  it('hace únicos los ids repetidos', () => {
    expect(outline('## Pasos\n## Pasos\n## Pasos').map((entry) => entry.id)).toEqual(['pasos', 'pasos-2', 'pasos-3'])
  })

  it('ignora # y ####, y lo que hay dentro de un bloque de código', () => {
    expect(outline('# Uno\n#### Cuatro\n```\n## En código\n```\n## Real').map((entry) => entry.text)).toEqual(['Real'])
  })

  it('quita énfasis y enlaces del texto', () => {
    expect(outline('## **Hola** [mundo](https://x.example) `ya`')).toEqual([
      { id: 'hola-mundo-ya', level: 2, text: 'Hola mundo ya' },
    ])
  })

  it('está vacío sin encabezados', () => {
    expect(outline('solo texto')).toEqual([])
  })
})
