import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArticleBody } from './ArticleBody'
import { outline } from './outline'

function renderBody(source: string) {
  return render(<ArticleBody source={source} />)
}

describe('ArticleBody', () => {
  it('dibuja negrita, cursiva y listas', () => {
    const { container } = renderBody('**fuerte** y _suave_\n\n- uno\n- dos\n\n1. primero\n2. segundo')
    expect(container.querySelector('strong')).toHaveTextContent('fuerte')
    expect(container.querySelector('em')).toHaveTextContent('suave')
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
    expect(container.querySelectorAll('ol > li')).toHaveLength(2)
  })

  it('abre los enlaces absolutos en otra pestaña, sin referrer ni opener', () => {
    renderBody('[Docs](https://ayuda.example/docs)')
    const link = screen.getByRole('link', { name: 'Docs' })
    expect(link).toHaveAttribute('href', 'https://ayuda.example/docs')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('deja los enlaces relativos y mailto en la misma pestaña', () => {
    renderBody('[Equipo](/equipo) y [Escríbenos](mailto:a@b.example)')
    const relative = screen.getByRole('link', { name: 'Equipo' })
    expect(relative).toHaveAttribute('href', '/equipo')
    expect(relative).not.toHaveAttribute('target')
    expect(relative).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Escríbenos' })).toHaveAttribute('href', 'mailto:a@b.example')
  })

  it.each([
    ['javascript:alert(1)', 'javascript'],
    ['JaVaScRiPt:alert(1)', 'mayúsculas'],
    ['data:text/html,<b>x</b>', 'data'],
    ['vbscript:msgbox(1)', 'vbscript'],
  ])('dibuja como texto el enlace con %s (%s)', (url) => {
    const { container } = renderBody(`[pulsa aquí](${url})`)
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('pulsa aquí')
    expect(container.innerHTML).not.toMatch(/javascript:|data:|vbscript:/i)
  })

  it('no deja pasar <script> ni <img onerror> al DOM', () => {
    const { container } = renderBody('Hola\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nAdiós')
    expect(container.querySelector('script, img')).toBeNull()
    expect(container.innerHTML).not.toContain('onerror')
    expect(container).toHaveTextContent('Hola')
    expect(container).toHaveTextContent('Adiós')
  })

  it('no deja pasar HTML en línea y dibuja las imágenes como su texto alternativo', () => {
    const { container } = renderBody('texto <b onclick="x()">negrita</b> ![logo de Resolve](https://x.example/a.png)')
    expect(container.querySelector('b, img, [onclick]')).toBeNull()
    expect(container).toHaveTextContent('texto negrita logo de Resolve')
    expect(container.innerHTML).not.toContain('x.example/a.png')
  })

  it('dibuja como texto una imagen con un esquema peligroso o con atributos en el alt', () => {
    const { container } = renderBody(
      '![x" onerror="alert(1)](javascript:alert(1)) ![ref][r]\n\n[r]: data:image/png;base64,AAAA',
    )
    expect(container.querySelector('img, a, [onerror]')).toBeNull()
    expect(container.innerHTML).not.toMatch(/javascript:|data:/i)
  })

  it('dibuja un encabezado de nivel 1 y un bloque de código como texto', () => {
    const { container } = renderBody('# Título\n\n```\nconst x = 1\n```')
    expect(container.querySelector('h1, pre, code')).toBeNull()
    expect(container).toHaveTextContent('Título')
    expect(container).toHaveTextContent('const x = 1')
  })

  it('asigna ids con prefijo, únicos por documento y los mismos que el índice', () => {
    const source = '## Pasos\n\ntexto\n\n### Detalle\n\n## Pasos\n\n## ¿Qué hacer?'
    renderBody(source)
    const ids = screen.getAllByRole('heading').map((heading) => [heading.tagName, heading.id])
    expect(ids).toEqual([
      ['H2', 'seccion-pasos'],
      ['H3', 'seccion-detalle'],
      ['H2', 'seccion-pasos-2'],
      ['H2', 'seccion-que-hacer'],
    ])
    expect(outline(source).map((entry) => entry.id)).toEqual(ids.map(([, id]) => id))
  })

  it.each([
    ['## Pasos\n## Pasos\n## Pasos 2', ['seccion-pasos', 'seccion-pasos-2', 'seccion-pasos-2-2']],
    ['## Paso 2\n## Paso\n## Paso', ['seccion-paso-2', 'seccion-paso', 'seccion-paso-3']],
  ])('un título repetido no repite el id de otro título: %j', (source, expected) => {
    const { container } = renderBody(source)
    const ids = [...container.querySelectorAll('h2')].map((heading) => heading.id)
    expect(ids).toEqual(expected)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('un encabezado «Contenido» o «Root» no toma el id de la aplicación', () => {
    const { container } = renderBody('## Contenido\n\n## Root')
    expect([...container.querySelectorAll('h2')].map((heading) => heading.id)).toEqual([
      'seccion-contenido',
      'seccion-root',
    ])
    expect(container.querySelector('#contenido, #root')).toBeNull()
  })

  it('un encabezado dentro de código o de HTML descartado no se dibuja ni se indexa', () => {
    const source = '````\n```js\n## dentro\n```\n````\n\n<div>\n## en html\n</div>\n\n## Real'
    const { container } = renderBody(source)
    expect([...container.querySelectorAll('h2')].map((heading) => heading.textContent)).toEqual(['Real'])
    expect(outline(source).map((entry) => entry.text)).toEqual(['Real'])
  })

  it('los enlaces //host se abren en otra pestaña, como los absolutos', () => {
    renderBody('[fuera](//otro.example/p) [aquí](/equipo)')
    expect(screen.getByRole('link', { name: 'fuera' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'aquí' })).not.toHaveAttribute('target')
  })
})
