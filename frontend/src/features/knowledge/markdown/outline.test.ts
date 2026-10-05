import { describe, expect, it } from 'vitest'
import { outline } from './outline'

describe('outline', () => {
  it('lista los encabezados ## y ### en orden, con sus niveles y ids con prefijo', () => {
    expect(outline('Intro\n\n## Primero\n\ntexto\n\n### Sub\n\n## Segundo')).toEqual([
      { id: 'seccion-primero', level: 2, text: 'Primero' },
      { id: 'seccion-sub', level: 3, text: 'Sub' },
      { id: 'seccion-segundo', level: 2, text: 'Segundo' },
    ])
  })

  it('hace únicos los ids repetidos', () => {
    expect(outline('## Pasos\n## Pasos\n## Pasos').map((entry) => entry.id)).toEqual([
      'seccion-pasos',
      'seccion-pasos-2',
      'seccion-pasos-3',
    ])
  })

  it('no repite un id aunque un título repetido coincida con el slug de otro', () => {
    for (const source of [
      '## Pasos\n## Pasos\n## Pasos 2',
      '## Paso 2\n## Paso\n## Paso',
      '## A\n## A\n## A 2\n## A 2',
    ]) {
      const ids = outline(source).map((entry) => entry.id)
      expect(new Set(ids).size, source).toBe(ids.length)
    }
  })

  it('un título «Contenido» no produce el id de la aplicación', () => {
    expect(outline('## Contenido').map((entry) => entry.id)).toEqual(['seccion-contenido'])
  })

  it('ignora # y ####', () => {
    expect(outline('# Uno\n#### Cuatro\n## Real').map((entry) => entry.text)).toEqual(['Real'])
  })

  it('ignora lo que hay en bloques de código, también con fences anidadas, y en HTML descartado', () => {
    const source = [
      '````',
      '```js',
      '## dentro',
      '```',
      '## aún dentro',
      '````',
      '',
      '~~~',
      '## con tildes',
      '~~~',
      '',
      '<div>',
      '## en html',
      '</div>',
      '',
      '    ## sangrado',
      '',
      '## Real',
    ].join('\n')
    expect(outline(source).map((entry) => entry.text)).toEqual(['Real'])
  })

  it('el texto es el dibujado: entidades, escapes, énfasis, enlaces, código y etiquetas resueltos', () => {
    expect(outline('## Café &amp; té').map((entry) => entry.text)).toEqual(['Café & té'])
    expect(outline('## A \\*b\\*').map((entry) => entry.text)).toEqual(['A *b*'])
    expect(outline('## Hola <b>x</b>').map((entry) => entry.text)).toEqual(['Hola x'])
    expect(outline('## **Hola** [mundo](https://x.example) `ya`')).toEqual([
      { id: 'seccion-hola-mundo-ya', level: 2, text: 'Hola mundo ya' },
    ])
  })

  it('incluye los encabezados dentro de listas y citas, que se dibujan', () => {
    expect(outline('> ## Cita\n\n- ## Lista').map((entry) => entry.text)).toEqual(['Cita', 'Lista'])
  })

  it('un encabezado con solo una imagen toma su texto alternativo', () => {
    expect(outline('## ![Logo](https://x.example/l.png)').map((entry) => entry.text)).toEqual(['Logo'])
  })

  it('descarta un encabezado que se queda sin texto', () => {
    expect(outline('## ![](x)\n\n##\n\n## ![ ](x)\n\n## Real')).toEqual([
      { id: 'seccion-real', level: 2, text: 'Real' },
    ])
  })

  it('está vacío sin encabezados', () => {
    expect(outline('solo texto')).toEqual([])
  })
})
