import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GettingStarted as Steps } from '../../api/schema'
import { adminMe, mockApi } from '../../test/api'
import { createTestQueryClient, renderWithProviders } from '../../test/render'
import { metrics } from '../../test/ticketFixtures'
import { ticketKeys } from '../tickets/queries'
import { GettingStarted } from './GettingStarted'

const none: Steps = { invitedTeam: false, addedCustomer: false, publishedArticle: false }
const withSteps = (gettingStarted: Steps | null) => ({ ...metrics, gettingStarted })

function renderSteps(body: object | (() => { body: object }), queryClient = createTestQueryClient()) {
  const spy = mockApi({
    'GET /api/me': { body: adminMe },
    'GET /api/tickets/metrics': typeof body === 'function' ? (body as () => { body: object }) : { body },
  })
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <>
            <h1>Inicio</h1>
            <GettingStarted />
          </>
        ),
      },
      { path: '/clientes/nuevo', element: <h1>Nuevo cliente</h1> },
      { path: '/conocimiento/nuevo', element: <h1>Nuevo artículo</h1> },
    ],
    { initialEntries: ['/'] },
  )
  renderWithProviders(<RouterProvider router={router} />, queryClient)
  return { router, spy, queryClient }
}

afterEach(() => vi.restoreAllMocks())

/** Como el de la aplicación: lo leído hace menos de 30 s no se vuelve a pedir al montar (el de los tests pide siempre). */
function freshClient() {
  const queryClient = createTestQueryClient()
  queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity, staleTime: 30_000 } })
  return queryClient
}

describe('«Primeros pasos» en Inicio', () => {
  it('con `gettingStarted: null` no pinta nada', async () => {
    const { spy } = renderSteps(withSteps(null))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument())
    expect(screen.queryByText('Primeros pasos')).not.toBeInTheDocument()
  })

  it('un espacio nuevo: «1 de 4 hechos», «Crea tu espacio» hecho y los tres pasos con su botón', async () => {
    renderSteps(withSteps(none))
    const panel = await screen.findByRole('region', { name: 'Primeros pasos' })
    expect(within(panel).getByRole('status')).toHaveTextContent('1 de 4 hechos')
    const steps = within(panel).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual([
      'Crea tu espacio (hecho)',
      'Invita a tu equipoInvitar',
      'Añade tu primer clienteAñadir cliente',
      'Publica un artículo de ayudaEscribir artículo',
    ])
    expect(within(panel).getByRole('link', { name: 'Añadir cliente' })).toHaveAttribute('href', '/clientes/nuevo')
    expect(within(panel).getByRole('link', { name: 'Escribir artículo' })).toHaveAttribute(
      'href',
      '/conocimiento/nuevo',
    )
  })

  it('un paso hecho va tachado, con su marca y su texto «(hecho)», y sin botón; el recuento sube', async () => {
    renderSteps(withSteps({ ...none, addedCustomer: true }))
    const panel = await screen.findByRole('region', { name: 'Primeros pasos' })
    expect(within(panel).getByRole('status')).toHaveTextContent('2 de 4 hechos')
    const step = within(panel).getByText('Añade tu primer cliente').closest('li')!
    expect(step).toHaveTextContent('Añade tu primer cliente (hecho)')
    expect(within(step).queryByRole('link')).not.toBeInTheDocument()
    // El estado no depende solo del color: lleva una marca (icono) y el tachado es de CSS sobre el texto.
    expect(step.querySelector('svg')).not.toBeNull()
    expect(within(panel).getByRole('button', { name: 'Invitar' })).toBeInTheDocument()
  })

  it('«Invitar» abre el diálogo de invitar de Equipo sin salir de Inicio y, al cerrarlo, vuelve a leer los pasos', async () => {
    let calls = 0
    const { router } = renderSteps(() => {
      calls += 1
      return { body: withSteps(calls === 1 ? none : { ...none, invitedTeam: true }) }
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Invitar' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invitar agente' })
    expect(router.state.location.pathname).toBe('/')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(calls).toBe(2))
    const panel = await screen.findByRole('region', { name: 'Primeros pasos' })
    await waitFor(() => expect(within(panel).getByRole('status')).toHaveTextContent('2 de 4 hechos'))
    // El botón pulsado desapareció con el paso: el foco no cae en `body`, va al título del panel.
    await waitFor(() => expect(within(panel).getByRole('heading', { name: 'Primeros pasos' })).toHaveFocus())
  })

  it('al volver a Inicio con datos de hace 10 s (aún frescos) los relee, en lugar de enseñar un paso hecho como pendiente', async () => {
    const queryClient = freshClient()
    queryClient.setQueryData(ticketKeys.metrics(), withSteps(none), { updatedAt: Date.now() - 10_000 })
    let calls = 0
    renderSteps(() => {
      calls += 1
      return { body: withSteps({ ...none, addedCustomer: true }) }
    }, queryClient)
    const panel = await screen.findByRole('region', { name: 'Primeros pasos' })
    await waitFor(() => expect(within(panel).getByRole('status')).toHaveTextContent('2 de 4 hechos'))
    expect(calls).toBe(1)
  })

  it('datos recién llegados (p. ej. al crear el espacio) no se vuelven a pedir al montar', async () => {
    const queryClient = freshClient()
    queryClient.setQueryData(ticketKeys.metrics(), withSteps(none), { updatedAt: Date.now() })
    let calls = 0
    renderSteps(() => {
      calls += 1
      return { body: withSteps(none) }
    }, queryClient)
    await screen.findByRole('region', { name: 'Primeros pasos' })
    await act(async () => {})
    expect(calls).toBe(0)
  })

  it('datos recientes pero con una escritura terminada después (volver de Clientes en pocos segundos) sí se releen', async () => {
    const queryClient = freshClient()
    queryClient.setQueryData(ticketKeys.metrics(), withSteps(none), { updatedAt: Date.now() - 1_000 })
    // Una escritura que termina bien después de leer los datos: crear un cliente, invitar…
    await act(async () => {
      await queryClient
        .getMutationCache()
        .build(queryClient, { mutationFn: async () => 'hecho' })
        .execute(undefined)
    })
    let calls = 0
    renderSteps(() => {
      calls += 1
      return { body: withSteps({ ...none, addedCustomer: true }) }
    }, queryClient)
    const panel = await screen.findByRole('region', { name: 'Primeros pasos' })
    await waitFor(() => expect(within(panel).getByRole('status')).toHaveTextContent('2 de 4 hechos'))
    expect(calls).toBe(1)
  })

  it('con la caché obsoleta la consulta ya se pide sola: no se pide dos veces', async () => {
    const queryClient = freshClient()
    queryClient.setQueryData(ticketKeys.metrics(), withSteps(none), { updatedAt: Date.now() - 60_000 })
    let calls = 0
    renderSteps(() => {
      calls += 1
      return { body: withSteps({ ...none, addedCustomer: true }) }
    }, queryClient)
    const panel = await screen.findByRole('region', { name: 'Primeros pasos' })
    await waitFor(() => expect(within(panel).getByRole('status')).toHaveTextContent('2 de 4 hechos'))
    await act(async () => {})
    expect(calls).toBe(1)
  })

  it('al hacerse el último paso el servidor manda `null`: el panel desaparece y el foco va al título de la página', async () => {
    const queryClient = createTestQueryClient()
    renderSteps(withSteps({ ...none, invitedTeam: true, addedCustomer: true }), queryClient)
    const publish = await screen.findByRole('link', { name: 'Escribir artículo' })
    publish.focus()
    expect(publish).toHaveFocus()
    act(() => {
      queryClient.setQueryData(ticketKeys.metrics(), withSteps(null))
    })
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Primeros pasos' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Inicio' })).toHaveFocus())
  })
})
