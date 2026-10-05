import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminMe, customerMe, mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { article } from './articleFixtures'
import { ArticlePage } from './ArticlePage'
import { articleKeys } from './queries'

const agentMe = {
  ...adminMe,
  user: { id: 'u-laura', name: 'Laura Méndez', email: 'laura@acme.example' },
  role: 'agent',
}

const SLUG = 'como-recuperar-el-acceso-a-tu-cuenta'

function renderArticle(slug = 'como-recuperar-el-acceso-a-tu-cuenta') {
  const router = createMemoryRouter(
    [
      { path: '/conocimiento', element: <p>Lista</p> },
      { path: '/conocimiento/:slug', element: <ArticlePage /> },
      { path: '/tickets/nuevo', element: <p>Nuevo ticket</p> },
    ],
    { initialEntries: [`/conocimiento/${slug}`] },
  )
  return renderWithProviders(<RouterProvider router={router} />)
}

const api = (overrides = {}) =>
  mockApi({
    'GET /api/me': { body: adminMe },
    'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': { body: article() },
    ...overrides,
  })

/** jsdom no tiene diseño: hace que solo coincida la media query pedida. */
function matchOnly(query: string) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (media) =>
      ({
        matches: media === query,
        media,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('ArticlePage', () => {
  it('muestra un esqueleto mientras carga', () => {
    api({ 'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': () => new Promise(() => {}) as never })
    renderArticle()
    expect(screen.getByText('Cargando artículo…')).toBeInTheDocument()
  })

  it('un artículo inexistente muestra «no encontrado» con un enlace a la lista', async () => {
    api({
      'GET /api/knowledge/articles/otro': { status: 404, body: { status: 404, title: 'No encontrado' } },
    })
    renderArticle('otro')
    expect(await screen.findByRole('heading', { level: 1, name: 'Artículo no encontrado' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a la base de conocimiento' })).toHaveAttribute(
      'href',
      '/conocimiento',
    )
  })

  it('un error de red ofrece reintentar', async () => {
    api({
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': {
        status: 500,
        body: { status: 500, title: 'Error' },
      },
    })
    renderArticle()
    expect(await screen.findByRole('heading', { level: 1, name: 'No pudimos cargar el artículo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('dibuja el título, la categoría, la fecha real y el tiempo de lectura real', async () => {
    api()
    renderArticle()
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cuenta y acceso' })).toHaveAttribute(
      'href',
      '/conocimiento?category=cuenta-y-acceso',
    )
    expect(screen.getByText(/^Actualizado: .+, 05:00 · Lectura: 1 minuto$/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Solicita un enlace nuevo' })).toHaveAttribute(
      'id',
      'seccion-solicita-un-enlace-nuevo',
    )
  })

  it('el índice enlaza a los ids de los encabezados reales y mueve el foco al saltar', async () => {
    api()
    renderArticle()
    const outline = await screen.findByRole('navigation', { name: 'En este artículo' })
    const links = within(outline).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Solicita un enlace nuevo', '#seccion-solicita-un-enlace-nuevo'],
      ['Revisa el correo', '#seccion-revisa-el-correo'],
      ['Recupera el acceso', '#seccion-recupera-el-acceso'],
    ])
    for (const link of links) {
      expect(document.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull()
    }
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    await userEvent.click(links[2]!)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.getByRole('heading', { level: 2, name: 'Recupera el acceso' })).toHaveFocus()
  })

  it('por debajo de 1200 px el índice es un desplegable y hay un solo índice', async () => {
    api()
    const { container } = renderArticle()
    await screen.findByRole('navigation', { name: 'En este artículo' })
    expect(container.querySelector('details')).not.toBeNull()
    expect(screen.getAllByRole('navigation', { name: 'En este artículo' })).toHaveLength(1)
  })

  it('desde 1200 px el índice es un panel lateral, sin desplegable', async () => {
    matchOnly('(min-width: 1200px)')
    api()
    const { container } = renderArticle()
    expect(await screen.findByRole('heading', { level: 2, name: 'En este artículo' })).toBeInTheDocument()
    expect(container.querySelector('details')).toBeNull()
    expect(screen.getAllByRole('navigation', { name: 'En este artículo' })).toHaveLength(1)
  })

  it('un artículo sin encabezados no dibuja índice', async () => {
    api({
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': { body: article({ body: 'Solo texto.' }) },
    })
    renderArticle()
    await screen.findByText('Solo texto.')
    expect(screen.queryByRole('navigation', { name: 'En este artículo' })).not.toBeInTheDocument()
  })

  it('el cuerpo se muestra como Markdown seguro, nunca como HTML', async () => {
    api({
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': {
        body: article({ body: 'Hola <script>alert(1)</script> **negrita**' }),
      },
    })
    const { container } = renderArticle()
    expect(await screen.findByText('negrita')).toContainHTML('<strong>negrita</strong>')
    expect(container.querySelector('script')).toBeNull()
  })

  it('el personal ve el estado, «Editar artículo» y «Crear un ticket»', async () => {
    api({ 'GET /api/me': { body: agentMe } })
    renderArticle()
    expect(await screen.findByText('Publicado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar artículo' })).toHaveAttribute(
      'href',
      '/conocimiento/como-recuperar-el-acceso-a-tu-cuenta/editar',
    )
    expect(screen.getByRole('link', { name: 'Crear un ticket' })).toHaveAttribute('href', '/tickets/nuevo')
    expect(screen.queryByText(/Borrador: los clientes no lo ven/)).not.toBeInTheDocument()
  })

  it('un borrador avisa al personal de que los clientes no lo ven', async () => {
    api({
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': {
        body: article({ status: 'draft', publishedAt: null, visibility: 'internal' }),
      },
    })
    renderArticle()
    expect(await screen.findByText('Borrador: los clientes no lo ven')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
    expect(screen.getByText('Solo el equipo')).toBeInTheDocument()
  })

  it('un cliente no tiene botón de editar ni estado, y ve el correo de soporte', async () => {
    api({
      'GET /api/me': {
        body: { ...customerMe, organization: { ...customerMe.organization, supportEmail: 'ayuda@acme.example' } },
      },
    })
    renderArticle()
    await screen.findByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' })
    expect(screen.queryByRole('link', { name: 'Editar artículo' })).not.toBeInTheDocument()
    expect(screen.queryByText('Publicado')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Crear un ticket' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ayuda@acme.example' })).toHaveAttribute(
      'href',
      'mailto:ayuda@acme.example',
    )
  })

  it('un cliente sin correo de soporte ve un texto genérico', async () => {
    api({ 'GET /api/me': { body: customerMe } })
    renderArticle()
    expect(await screen.findByText('Contacta con el equipo de soporte de tu organización.')).toBeInTheDocument()
  })

  it('un fallo al refrescar un artículo ya leído no lo sustituye por un error', async () => {
    api()
    const { queryClient } = renderArticle()
    await screen.findByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' })
    api({
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': {
        status: 500,
        body: { status: 500, title: 'Error' },
      },
    })
    await act(() => queryClient.invalidateQueries({ queryKey: articleKeys.detail(SLUG) }))
    await waitFor(() => expect(queryClient.getQueryState(articleKeys.detail(SLUG))?.status).toBe('error'))
    expect(screen.getByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' })).toBeInTheDocument()
    expect(screen.queryByText('No pudimos cargar el artículo')).not.toBeInTheDocument()
  })

  it('un 404 al refrescar un artículo ya leído sí lo sustituye por «no encontrado»', async () => {
    api()
    const { queryClient } = renderArticle()
    await screen.findByRole('heading', { level: 1, name: 'Cómo recuperar el acceso a tu cuenta' })
    api({
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': {
        status: 404,
        body: { status: 404, title: 'No encontrado' },
      },
    })
    await act(() => queryClient.invalidateQueries({ queryKey: articleKeys.detail(SLUG) }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Artículo no encontrado' })).toBeInTheDocument()
  })

  it('un 404 a un cliente (borrador) se trata como un enlace roto', async () => {
    api({
      'GET /api/me': { body: customerMe },
      'GET /api/knowledge/articles/como-recuperar-el-acceso-a-tu-cuenta': {
        status: 404,
        body: { status: 404, title: 'No encontrado' },
      },
    })
    renderArticle()
    expect(await screen.findByRole('heading', { level: 1, name: 'Artículo no encontrado' })).toBeInTheDocument()
  })
})
