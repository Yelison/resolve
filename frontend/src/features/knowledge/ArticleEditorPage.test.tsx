import { focusManager } from '@tanstack/react-query'
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { inOrder, lockTimeoutRoute, retryAfterLockTimeout, type SentRequest } from '../../lib/lockTimeoutTesting'
import { adminMe, mockApi, type MockRoute } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import { article, category } from './articleFixtures'
import { articleKeys } from './queries'
import { draftKey, serializeDraft } from './articleDraft'
import { ArticleEditorPage } from './ArticleEditorPage'

const SLUG = 'como-recuperar-el-acceso-a-tu-cuenta'
const categories = [category(), category({ id: 'cat-factura', name: 'Facturación', slug: 'facturacion' })]

const etag = (version: number) => ({ ETag: `"${version}"` })

function renderEditor(path = `/conocimiento/${SLUG}/editar`) {
  const router = createMemoryRouter(
    [
      { path: '/conocimiento/nuevo', element: <ArticleEditorPage /> },
      { path: '/conocimiento/:slug/editar', element: <ArticleEditorPage /> },
      { path: '/conocimiento/:slug', element: <p>Lectura</p> },
    ],
    { initialEntries: [path] },
  )
  return { router, ...renderWithProviders(<RouterProvider router={router} />) }
}

const api = (routes: Record<string, MockRoute | ((request: Request) => MockRoute | Promise<MockRoute>)> = {}) =>
  mockApi({
    'GET /api/me': { body: adminMe },
    'GET /api/knowledge/categories': { body: categories },
    [`GET /api/knowledge/articles/${SLUG}`]: { body: article(), headers: etag(3) },
    ...routes,
  })

const requestsWith = (spy: ReturnType<typeof mockApi>, method: string, path: string) =>
  spy.mock.calls
    .map(([input]) => input as Request)
    .filter((r) => r.method === method && new URL(r.url).pathname === path)

/** Servidor simulado cuyo artículo puede cambiar entre dos peticiones, como si otra pestaña guardara antes. */
function conflictApi() {
  let current = article()
  let currentEtag = 3
  const spy = api({
    [`GET /api/knowledge/articles/${SLUG}`]: () => ({ body: current, headers: etag(currentEtag) }),
    [`PATCH /api/knowledge/articles/${SLUG}`]: (request) => {
      if (request.headers.get('If-Match') === `"${currentEtag}"`) {
        return { body: current, headers: etag(currentEtag) }
      }
      return { status: 412, body: { status: 412, title: 'El recurso cambió' } }
    },
  })
  const otherTabSaves = () => {
    current = article({ title: 'Título de otra persona', body: 'Texto de otra persona', version: 4 })
    currentEtag = 4
  }
  return { spy, otherTabSaves }
}

// La vista previa se carga con `lazy`: la primera importación transforma `react-markdown` en frío. Se precarga aquí y las
// esperas que dependen de ella llevan un margen explícito.
beforeAll(async () => {
  await import('./ArticlePreview')
}, 60_000)
const COLD = { timeout: 10_000 }

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('ArticleEditorPage · nuevo', () => {
  it('dibuja el formulario vacío, con el editor en modo artículo y sin Publicar disponible', async () => {
    api()
    renderEditor('/conocimiento/nuevo')
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuevo artículo' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Responder al cliente' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled()
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()
    expect(screen.queryByText('Borrador guardado en este navegador')).not.toBeInTheDocument()
  })

  it('valida título, contenido y categoría con los errores asociados a cada campo y sin enviar', async () => {
    const spy = api()
    renderEditor('/conocimiento/nuevo')
    await userEvent.click(await screen.findByRole('button', { name: 'Guardar borrador' }))
    const title = screen.getByRole('textbox', { name: 'Título' })
    expect(title).toBeInvalid()
    expect(title).toHaveAccessibleDescription('Escribe un título.')
    expect(title).toHaveFocus()
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveAccessibleDescription(
      'Escribe el contenido del artículo.',
    )
    expect(screen.getByRole('combobox', { name: 'Categoría' })).toHaveAccessibleDescription('Elige una categoría.')
    expect(requestsWith(spy, 'POST', '/api/knowledge/articles')).toHaveLength(0)
  })

  it('crea el borrador una sola vez, borra el texto local y abre el editor del artículo', async () => {
    let release: () => void = () => {}
    const spy = api({
      'POST /api/knowledge/articles': () =>
        new Promise<MockRoute>((resolve) => {
          release = () => resolve({ status: 201, body: article({ version: 0 }), headers: etag(0) })
        }),
    })
    const { router } = renderEditor('/conocimiento/nuevo')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Título' }), 'Cómo recuperar')
    await userEvent.type(screen.getByRole('textbox', { name: 'Contenido' }), '## Paso')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Cuenta y acceso')
    expect(screen.getByText('Borrador guardado en este navegador')).toBeInTheDocument()
    expect(sessionStorage.getItem(draftKey(undefined))).not.toBeNull()

    const save = screen.getByRole('button', { name: 'Guardar borrador' })
    await userEvent.click(save)
    await userEvent.click(save)
    await userEvent.click(save)
    await waitFor(() => expect(requestsWith(spy, 'POST', '/api/knowledge/articles')).toHaveLength(1))
    const sent = await requestsWith(spy, 'POST', '/api/knowledge/articles')[0]!.clone().json()
    expect(sent).toEqual({
      title: 'Cómo recuperar',
      body: '## Paso',
      categoryId: 'cat-acceso',
      visibility: 'public',
      allowFeedback: true,
    })
    release()
    await waitFor(() => expect(router.state.location.pathname).toBe(`/conocimiento/${SLUG}/editar`))
    expect(sessionStorage.getItem(draftKey(undefined))).toBeNull()
  })

  it('un 409 por el slug avisa y conserva lo escrito', async () => {
    api({ 'POST /api/knowledge/articles': { status: 409, body: { status: 409, title: 'Conflicto' } } })
    renderEditor('/conocimiento/nuevo')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Título' }), 'Repetido')
    await userEvent.type(screen.getByRole('textbox', { name: 'Contenido' }), 'Texto')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Facturación')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(
      await screen.findByText('Otro artículo se acaba de crear con el mismo enlace; vuelve a intentarlo.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Repetido')
  })

  it('el 409 del tope de la demostración muestra su detail, no el aviso del slug, y conserva lo escrito', async () => {
    api({
      'POST /api/knowledge/articles': {
        status: 409,
        body: {
          status: 409,
          title: 'Límite de la demostración',
          detail: 'La demostración admite hasta 100 artículos.',
        },
      },
    })
    renderEditor('/conocimiento/nuevo')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Título' }), 'Uno más')
    await userEvent.type(screen.getByRole('textbox', { name: 'Contenido' }), 'Texto')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Facturación')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('La demostración admite hasta 100 artículos.')).toBeInTheDocument()
    expect(screen.queryByText(/Otro artículo se acaba de crear con el mismo enlace/)).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Uno más')
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue('Texto')
  })

  it('muestra el error de campo que devuelve el servidor', async () => {
    api({
      'POST /api/knowledge/articles': {
        status: 400,
        body: {
          status: 400,
          title: 'Datos no válidos',
          errors: [{ field: 'title', message: 'Título demasiado largo' }],
        },
      },
    })
    renderEditor('/conocimiento/nuevo')
    await userEvent.type(await screen.findByRole('textbox', { name: 'Título' }), 'x')
    await userEvent.type(screen.getByRole('textbox', { name: 'Contenido' }), 'x')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Facturación')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))
    expect(await screen.findByText('Título demasiado largo')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Título' })).toBeInvalid()
  })

  it('un borrador local de «nuevo» se recupera al volver', async () => {
    sessionStorage.setItem(draftKey(undefined), serializeDraft({ title: 'A medias', body: 'Texto', version: 0 }))
    api()
    renderEditor('/conocimiento/nuevo')
    expect(await screen.findByRole('textbox', { name: 'Título' })).toHaveValue('A medias')
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue('Texto')
  })
})

describe('ArticleEditorPage · edición', () => {
  it('carga el artículo y solo permite guardar con cambios', async () => {
    api()
    renderEditor()
    expect(await screen.findByRole('textbox', { name: 'Título' })).toHaveValue('Cómo recuperar el acceso a tu cuenta')
    expect(screen.getByRole('heading', { level: 1, name: 'Editar artículo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Clientes y equipo' })).toBeChecked()
    expect(screen.getByRole('switch', { name: 'Permitir valoraciones' })).toBeChecked()
    expect(screen.getByText('Publicado')).toBeInTheDocument()
  })

  it('un artículo inexistente muestra «no encontrado»', async () => {
    api({ [`GET /api/knowledge/articles/${SLUG}`]: { status: 404, body: { status: 404, title: 'No encontrado' } } })
    renderEditor()
    expect(await screen.findByRole('heading', { level: 1, name: 'Artículo no encontrado' })).toBeInTheDocument()
  })

  it('guarda con If-Match y envía solo los campos cambiados', async () => {
    const spy = api({
      [`PATCH /api/knowledge/articles/${SLUG}`]: {
        body: article({ title: 'Nuevo título', version: 4 }),
        headers: etag(4),
      },
    })
    renderEditor()
    const title = await screen.findByRole('textbox', { name: 'Título' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Nuevo título')
    await userEvent.click(screen.getByRole('switch', { name: 'Permitir valoraciones' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    const [patch] = requestsWith(spy, 'PATCH', `/api/knowledge/articles/${SLUG}`)
    expect(patch!.headers.get('If-Match')).toBe('"3"')
    expect(await patch!.clone().json()).toEqual({ title: 'Nuevo título', allowFeedback: false })
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    expect(sessionStorage.getItem(draftKey(SLUG))).toBeNull()
  })

  it('un solo envío aunque se pulse varias veces mientras se guarda', async () => {
    let release: () => void = () => {}
    const spy = api({
      [`PATCH /api/knowledge/articles/${SLUG}`]: () =>
        new Promise<MockRoute>((resolve) => {
          release = () => resolve({ body: article({ title: 'Otro', version: 4 }), headers: etag(4) })
        }),
    })
    renderEditor()
    const title = await screen.findByRole('textbox', { name: 'Título' })
    await userEvent.clear(title)
    await userEvent.type(title, 'Otro')
    const save = screen.getByRole('button', { name: 'Guardar' })
    await userEvent.click(save)
    await userEvent.click(screen.getByRole('button', { name: 'Guardando…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardando…' }))
    release()
    await screen.findByText('Cambios guardados')
    expect(requestsWith(spy, 'PATCH', `/api/knowledge/articles/${SLUG}`)).toHaveLength(1)
  })

  describe('un 412', () => {
    async function provoke412(otherTabSaves: () => void) {
      renderEditor()
      const title = await screen.findByRole('textbox', { name: 'Título' })
      await userEvent.type(title, ' (mío)')
      otherTabSaves()
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    }

    it('conserva el texto propio en el borrador, muestra el del servidor y deja restaurarlo', async () => {
      const { spy, otherTabSaves } = conflictApi()
      await provoke412(otherTabSaves)
      expect(await screen.findByText('Hay un borrador tuyo sin guardar')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona')
      // Mientras el borrador espera, lo que se vea no se escribe en el navegador: la nota no puede prometerlo.
      expect(screen.queryByText('Borrador guardado en este navegador')).not.toBeInTheDocument()
      expect(JSON.parse(sessionStorage.getItem(draftKey(SLUG))!)).toMatchObject({
        title: 'Cómo recuperar el acceso a tu cuenta (mío)',
        version: 3,
      })

      await userEvent.click(screen.getByRole('button', { name: 'Restaurar mi borrador' }))
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Cómo recuperar el acceso a tu cuenta (mío)')
      expect(screen.queryByText('Hay un borrador tuyo sin guardar')).not.toBeInTheDocument()

      // Lo restaurado se guarda sobre la versión nueva.
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
      const patches = requestsWith(spy, 'PATCH', `/api/knowledge/articles/${SLUG}`)
      expect(patches.at(-1)!.headers.get('If-Match')).toBe('"4"')
    })

    it('tras recargar la página sigue ofreciendo el borrador', async () => {
      const { otherTabSaves } = conflictApi()
      await provoke412(otherTabSaves)
      await screen.findByText('Hay un borrador tuyo sin guardar')
      // Recarga: la pestaña se monta de nuevo con lo que quedó en sessionStorage y la versión nueva del servidor.
      document.body.innerHTML = ''
      renderEditor()
      expect(await screen.findByText('Hay un borrador tuyo sin guardar')).toBeInTheDocument()
      expect(await screen.findByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona')
      await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
      expect(sessionStorage.getItem(draftKey(SLUG))).toBeNull()
    })
  })

  describe('una versión nueva que no viene de mi guardado', () => {
    const articlePath = `/api/knowledge/articles/${SLUG}`

    it('tras una invalidación con cambios sin guardar avisa antes de enviar y no pisa lo de la otra persona', async () => {
      const { spy, otherTabSaves } = conflictApi()
      const { queryClient } = renderEditor()
      const body = await screen.findByRole('textbox', { name: 'Contenido' })
      await userEvent.type(body, ' Añadido por mí.')
      otherTabSaves()
      await act(() => queryClient.invalidateQueries({ queryKey: articleKeys.detail(SLUG) }))

      expect(await screen.findByText('Hay un borrador tuyo sin guardar')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona')
      expect(requestsWith(spy, 'PATCH', articlePath)).toHaveLength(0)

      // Restaurar devuelve solo lo que yo cambié (el cuerpo): el título de la otra persona sigue.
      await userEvent.click(screen.getByRole('button', { name: 'Restaurar mi borrador' }))
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona')
      expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue(`${article().body} Añadido por mí.`)
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('Cambios guardados')
      const [patch] = requestsWith(spy, 'PATCH', articlePath)
      expect(patch!.headers.get('If-Match')).toBe('"4"')
      expect(await patch!.clone().json()).toEqual({ body: `${article().body} Añadido por mí.` })
    })

    it('volver a la pestaña no recarga el artículo: el guardado va con la versión original y da 412', async () => {
      const { spy, otherTabSaves } = conflictApi()
      renderEditor()
      const body = await screen.findByRole('textbox', { name: 'Contenido' })
      await userEvent.type(body, ' Añadido por mí.')
      otherTabSaves()
      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(requestsWith(spy, 'GET', articlePath)).toHaveLength(1)
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(await screen.findByText('Hay un borrador tuyo sin guardar')).toBeInTheDocument()
      const [patch] = requestsWith(spy, 'PATCH', articlePath)
      expect(patch!.headers.get('If-Match')).toBe('"3"')
      expect(await patch!.clone().json()).toEqual({ body: `${article().body} Añadido por mí.` })
    })

    it('sin cambios pendientes el formulario se actualiza en silencio y el siguiente guardado usa la versión nueva', async () => {
      const { spy, otherTabSaves } = conflictApi()
      const { queryClient } = renderEditor()
      await screen.findByRole('textbox', { name: 'Título' })
      otherTabSaves()
      await act(() => queryClient.invalidateQueries({ queryKey: articleKeys.detail(SLUG) }))
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona'))
      expect(screen.queryByText('Hay un borrador tuyo sin guardar')).not.toBeInTheDocument()

      await userEvent.type(screen.getByRole('textbox', { name: 'Título' }), '!')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('Cambios guardados')
      expect(requestsWith(spy, 'PATCH', articlePath)[0]!.headers.get('If-Match')).toBe('"4"')
    })

    it('un 412 con solo ajustes cambiados recarga, conserva los ajustes y no ofrece restaurar texto', async () => {
      const { otherTabSaves } = conflictApi()
      renderEditor()
      await screen.findByRole('textbox', { name: 'Título' })
      await userEvent.click(screen.getByRole('radio', { name: 'Solo el equipo' }))
      otherTabSaves()
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona'))
      expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue('Texto de otra persona')
      expect(screen.queryByText('Hay un borrador tuyo sin guardar')).not.toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Solo el equipo' })).toBeChecked()
      expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    })

    it('un 412 cuya recarga falla avisa, deja reintentar y, al llegar la versión nueva, sigue el camino normal', async () => {
      let phase: 'initial' | 'down' | 'back' = 'initial'
      api({
        [`GET /api/knowledge/articles/${SLUG}`]: () =>
          phase === 'down'
            ? { status: 503, body: { status: 503, title: 'No disponible' } }
            : phase === 'back'
              ? {
                  body: article({ title: 'Título de otra persona', body: 'Texto de otra persona', version: 4 }),
                  headers: etag(4),
                }
              : { body: article(), headers: etag(3) },
        [`PATCH /api/knowledge/articles/${SLUG}`]: () => {
          phase = 'down'
          return { status: 412, body: { status: 412, title: 'El recurso cambió' } }
        },
      })
      renderEditor()
      await userEvent.type(await screen.findByRole('textbox', { name: 'Título' }), ' (mío)')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      expect(
        await screen.findByText('Alguien guardó este artículo y no pudimos cargar su versión.'),
      ).toBeInTheDocument()
      // El texto sigue en el formulario y todavía no hay nada que restaurar.
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Cómo recuperar el acceso a tu cuenta (mío)')
      expect(screen.queryByText('Hay un borrador tuyo sin guardar')).not.toBeInTheDocument()

      // El servidor vuelve con una versión nueva: «Reintentar» relanza la lectura y se sigue el camino normal del 412.
      phase = 'back'
      await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
      expect(await screen.findByText('Hay un borrador tuyo sin guardar')).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona')
      expect(screen.queryByText('Alguien guardó este artículo y no pudimos cargar su versión.')).not.toBeInTheDocument()
    })

    it('publicar actualiza la versión base: el guardado siguiente va con la de la publicación', async () => {
      const spy = api({
        [`GET /api/knowledge/articles/${SLUG}`]: {
          body: article({ status: 'draft', publishedAt: null, version: 5 }),
          headers: etag(5),
        },
        [`POST /api/knowledge/articles/${SLUG}/publish`]: { body: article({ version: 6 }), headers: etag(6) },
        [`PATCH /api/knowledge/articles/${SLUG}`]: { body: article({ title: 'X', version: 7 }), headers: etag(7) },
      })
      renderEditor()
      await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }))
      await screen.findByText('Artículo publicado')
      await userEvent.type(screen.getByRole('textbox', { name: 'Título' }), '!')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
      await screen.findByText('Cambios guardados')
      expect(requestsWith(spy, 'PATCH', articlePath)[0]!.headers.get('If-Match')).toBe('"6"')
    })
  })

  it('una recarga a mitad de edición recupera el texto sin avisos si la versión no cambió', async () => {
    sessionStorage.setItem(
      draftKey(SLUG),
      serializeDraft({ title: 'Título a medias', body: 'Cuerpo a medias', version: 3 }),
    )
    api()
    renderEditor()
    expect(await screen.findByRole('textbox', { name: 'Título' })).toHaveValue('Título a medias')
    expect(screen.queryByText('Hay un borrador tuyo sin guardar')).not.toBeInTheDocument()
    expect(screen.getByText('Borrador guardado en este navegador')).toBeInTheDocument()
  })

  it('el borrador de un artículo no se mezcla con el de otro', async () => {
    sessionStorage.setItem(draftKey('otro-articulo'), serializeDraft({ title: 'Ajeno', body: 'Ajeno', version: 1 }))
    api()
    renderEditor()
    expect(await screen.findByRole('textbox', { name: 'Título' })).toHaveValue('Cómo recuperar el acceso a tu cuenta')
  })
})

describe('ArticleEditorPage · publicación', () => {
  const draftArticle = article({ status: 'draft', publishedAt: null, version: 5 })

  it('publica, cambia la insignia y avisa con un toast', async () => {
    api({
      [`GET /api/knowledge/articles/${SLUG}`]: { body: draftArticle, headers: etag(5) },
      [`POST /api/knowledge/articles/${SLUG}/publish`]: { body: article({ version: 6 }), headers: etag(6) },
    })
    renderEditor()
    expect(await screen.findByText('Borrador')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    expect(await screen.findByText('Artículo publicado')).toBeInTheDocument()
    expect(screen.getByText('Publicado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Despublicar' })).toBeEnabled()
  })

  it('no deja publicar con cambios sin guardar y explica por qué', async () => {
    api({ [`GET /api/knowledge/articles/${SLUG}`]: { body: draftArticle, headers: etag(5) } })
    renderEditor()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Título' }), '!')
    const publish = screen.getByRole('button', { name: 'Publicar' })
    expect(publish).toBeDisabled()
    expect(publish).toHaveAccessibleDescription('Guarda los cambios antes de cambiar el estado.')
  })

  it('despublicar pide confirmación y se puede cancelar', async () => {
    const spy = api({
      [`POST /api/knowledge/articles/${SLUG}/unpublish`]: { body: draftArticle, headers: etag(6) },
    })
    renderEditor()
    await userEvent.click(await screen.findByRole('button', { name: 'Despublicar' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Despublicar este artículo?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(requestsWith(spy, 'POST', `/api/knowledge/articles/${SLUG}/unpublish`)).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: 'Despublicar' }))
    await userEvent.click(
      within(await screen.findByRole('dialog', { name: '¿Despublicar este artículo?' })).getByRole('button', {
        name: 'Despublicar',
      }),
    )
    expect(await screen.findByText('Artículo despublicado')).toBeInTheDocument()
    expect(screen.getByText('Borrador')).toBeInTheDocument()
  })

  it('un 409 al publicar un artículo que ya lo estaba lo avisa', async () => {
    api({
      [`GET /api/knowledge/articles/${SLUG}`]: { body: draftArticle, headers: etag(5) },
      [`POST /api/knowledge/articles/${SLUG}/publish`]: { status: 409, body: { status: 409, title: 'Conflicto' } },
    })
    renderEditor()
    await userEvent.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect(await screen.findByText('El artículo ya estaba publicado')).toBeInTheDocument()
  })
})

describe('ArticleEditorPage · vista previa', () => {
  // La primera vista previa descarga y transforma `react-markdown`: en una máquina cargada supera los 5 s por defecto.
  it('renderiza el Markdown con ArticleBody, sin HTML en bruto', async () => {
    api()
    const { container } = renderEditor()
    const body = await screen.findByRole('textbox', { name: 'Contenido' })
    await userEvent.clear(body)
    await userEvent.type(body, '## Paso uno{Enter}{Enter}Texto **fuerte** <script>alert(1)</script>')
    await userEvent.click(screen.getByRole('tab', { name: 'Vista previa' }))
    expect(await screen.findByRole('heading', { level: 2, name: 'Paso uno' }, COLD)).toBeInTheDocument()
    expect(screen.getByText('fuerte')).toContainHTML('<strong>fuerte</strong>')
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'En este artículo' })).toBeInTheDocument()
  }, 20_000)

  it('sin contenido no hay nada que previsualizar', async () => {
    api()
    renderEditor('/conocimiento/nuevo')
    await userEvent.click(await screen.findByRole('tab', { name: 'Vista previa' }))
    expect(screen.getByText('Escribe algo en el contenido para ver cómo quedará.')).toBeInTheDocument()
  })

  it('el texto sigue ahí al volver de la vista previa', async () => {
    api()
    renderEditor()
    await screen.findByRole('textbox', { name: 'Contenido' })
    await userEvent.click(screen.getByRole('tab', { name: 'Vista previa' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Escribir' }))
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue(article().body)
  })
})

describe('ArticleEditorPage · un 503 de bloqueo', () => {
  const LOCK_MESSAGE = 'Alguien está guardando cambios aquí ahora mismo. Vuelve a intentarlo en un segundo.'
  const draftArticle = article({ status: 'draft', publishedAt: null, version: 5 })

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

  it('crear: conserva lo escrito, ofrece «Reintentar» y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      'POST /api/knowledge/articles': inOrder(seen, lockTimeoutRoute(), {
        status: 201,
        body: article({ version: 0 }),
        headers: etag(0),
      }),
    })
    const { router } = renderEditor('/conocimiento/nuevo')
    await user.type(await screen.findByRole('textbox', { name: 'Título' }), 'Cómo recuperar')
    await user.type(screen.getByRole('textbox', { name: 'Contenido' }), '## Paso')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Categoría' }), 'Cuenta y acceso')
    await user.click(screen.getByRole('button', { name: 'Guardar borrador' }))

    expect(await screen.findByText(LOCK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('No se pudo guardar el artículo')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Cómo recuperar')
    expect(screen.getByRole('textbox', { name: 'Contenido' })).toHaveValue('## Paso')

    await retryAfterLockTimeout(user, 'Reintentar guardar el artículo')
    await waitFor(() => expect(router.state.location.pathname).toBe(`/conocimiento/${SLUG}/editar`))
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
  })

  it('editar: repite el PATCH con el mismo cuerpo y la misma versión', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      [`PATCH /api/knowledge/articles/${SLUG}`]: inOrder(seen, lockTimeoutRoute(), {
        body: article({ title: 'Nuevo título', version: 4 }),
        headers: etag(4),
      }),
    })
    renderEditor()
    const title = await screen.findByRole('textbox', { name: 'Título' })
    await user.clear(title)
    await user.type(title, 'Nuevo título')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText(LOCK_MESSAGE)).toBeInTheDocument()
    expect(title).toHaveValue('Nuevo título')
    await retryAfterLockTimeout(user, 'Reintentar guardar el artículo')
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument()
    expect(screen.queryByText(LOCK_MESSAGE)).not.toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
    expect(seen[0]).toEqual({ body: JSON.stringify({ title: 'Nuevo título' }), ifMatch: '"3"' })
  })

  it('editar: si otra persona guardó entretanto, el reintento lleva la versión original y recibe el 412', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    let current = article()
    let currentEtag = 3
    const patch = inOrder(seen, lockTimeoutRoute(), { status: 412, body: { status: 412, title: 'El recurso cambió' } })
    api({
      [`GET /api/knowledge/articles/${SLUG}`]: () => ({ body: current, headers: etag(currentEtag) }),
      [`PATCH /api/knowledge/articles/${SLUG}`]: async (request) => {
        const reply = await patch(request)
        if (reply.status === 503) {
          // Otra persona guarda mientras esta escritura esperaba el bloqueo.
          current = article({ title: 'Título de otra persona', version: 4 })
          currentEtag = 4
        }
        return reply
      },
    })
    renderEditor()
    await user.type(await screen.findByRole('textbox', { name: 'Título' }), ' (mío)')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText(LOCK_MESSAGE)
    // La versión nueva llega por la recarga que hace la mutación; el reintento no la usa.
    expect(await screen.findByText('Hay un borrador tuyo sin guardar')).toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar guardar el artículo')

    await waitFor(() => expect(screen.queryByText(LOCK_MESSAGE)).not.toBeInTheDocument())
    expect(seen.map((request) => request.ifMatch)).toEqual(['"3"', '"3"'])
    expect(screen.getByRole('textbox', { name: 'Título' })).toHaveValue('Título de otra persona')
    expect(screen.queryByText('Cambios guardados')).not.toBeInTheDocument()
  })

  it('publicar ofrece «Reintentar» en el panel y repite la misma petición', async () => {
    const user = setup()
    const seen: SentRequest[] = []
    api({
      [`GET /api/knowledge/articles/${SLUG}`]: { body: draftArticle, headers: etag(5) },
      [`POST /api/knowledge/articles/${SLUG}/publish`]: inOrder(seen, lockTimeoutRoute(), {
        body: article({ version: 6 }),
        headers: etag(6),
      }),
    })
    renderEditor()
    await user.click(await screen.findByRole('button', { name: 'Publicar' }))
    expect(await screen.findByText(LOCK_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('No se pudo cambiar el estado')).not.toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar publicar el artículo')
    expect(await screen.findByText('Artículo publicado')).toBeInTheDocument()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toEqual(seen[0])
  })

  it('despublicar ofrece «Reintentar despublicar el artículo» y, si el reintento da 409, lo explica como siempre', async () => {
    const user = setup()
    api({
      [`POST /api/knowledge/articles/${SLUG}/unpublish`]: inOrder([], lockTimeoutRoute(), {
        status: 409,
        body: { status: 409, title: 'Conflicto' },
      }),
    })
    renderEditor()
    await user.click(await screen.findByRole('button', { name: 'Despublicar' }))
    const dialog = await screen.findByRole('dialog', { name: '¿Despublicar este artículo?' })
    await user.click(within(dialog).getByRole('button', { name: 'Despublicar' }))
    expect(await screen.findByText(LOCK_MESSAGE)).toBeInTheDocument()
    await retryAfterLockTimeout(user, 'Reintentar despublicar el artículo')
    expect(await screen.findByText('El artículo ya era un borrador')).toBeInTheDocument()
    expect(screen.queryByText(LOCK_MESSAGE)).not.toBeInTheDocument()
  })
})
