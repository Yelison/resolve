import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ArticleBody } from './ArticleBody'

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

  it('no deja pasar HTML en línea y descarta las imágenes de Markdown', () => {
    const { container } = renderBody('texto <b onclick="x()">negrita</b> ![logo](https://x.example/a.png)')
    expect(container.querySelector('b, img, [onclick]')).toBeNull()
    // Una imagen no tiene hijos que mostrar como texto: desaparece, y el resto del párrafo se conserva.
    expect(container).toHaveTextContent('texto negrita')
    expect(container).not.toHaveTextContent('logo')
  })

  it('dibuja un encabezado de nivel 1 y un bloque de código como texto', () => {
    const { container } = renderBody('# Título\n\n```\nconst x = 1\n```')
    expect(container.querySelector('h1, pre, code')).toBeNull()
    expect(container).toHaveTextContent('Título')
    expect(container).toHaveTextContent('const x = 1')
  })

  it('asigna ids únicos a los encabezados ## y ###, los mismos que el índice', () => {
    renderBody('## Pasos\n\ntexto\n\n### Detalle\n\n## Pasos\n\n## ¿Qué hacer?')
    const ids = screen.getAllByRole('heading').map((heading) => [heading.tagName, heading.id])
    expect(ids).toEqual([
      ['H2', 'pasos'],
      ['H3', 'detalle'],
      ['H2', 'pasos-2'],
      ['H2', 'que-hacer'],
    ])
  })
})
