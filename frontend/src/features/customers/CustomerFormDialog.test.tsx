import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi } from '../../test/api'
import { renderWithProviders } from '../../test/render'
import type { CustomerDetail } from '../../domain/customer'
import { CustomerFormDialog } from './CustomerFormDialog'
import { customerDetail } from './customerFixtures'
import { useCustomer } from './queries'

function renderDialog(
  props: { mode: 'create' | 'edit'; onSaved?: (customer: CustomerDetail) => void },
  onClose = vi.fn(),
) {
  renderWithProviders(
    props.mode === 'edit' ? (
      <CustomerFormDialog open onClose={onClose} mode="edit" customer={customerDetail()} onSaved={props.onSaved} />
    ) : (
      <CustomerFormDialog open onClose={onClose} mode="create" onSaved={props.onSaved} />
    ),
  )
  return onClose
}

const sent = (fetchSpy: ReturnType<typeof mockApi>, method: string) =>
  fetchSpy.mock.calls.map(([input]) => input as Request).find((request) => request.method === method)

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CustomerFormDialog', () => {
  it('valida el nombre y el correo antes de enviar y enfoca el primer error', async () => {
    const fetchSpy = mockApi({})
    renderDialog({ mode: 'create' })
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(screen.getByText('Escribe el nombre del cliente.')).toBeInTheDocument()
    expect(screen.getByText('Escribe el correo del cliente.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveFocus()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rechaza un correo con formato inválido', async () => {
    renderDialog({ mode: 'create' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Ana')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo' }), 'sin-arroba')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(screen.getByText(/Escribe un correo válido/)).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Correo' })).toHaveFocus()
  })

  it('crea el cliente, avisa solo tras la respuesta y cierra', async () => {
    let respond!: (value: { status: number; body: unknown }) => void
    const fetchSpy = mockApi({
      'POST /api/customers': () => new Promise((resolve) => (respond = resolve)),
    })
    const onSaved = vi.fn()
    const onClose = renderDialog({ mode: 'create', onSaved })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), '  Ana López ')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo' }), 'ana@cliente.example')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))

    // Mientras no hay respuesta: botón en carga y ningún éxito simulado.
    expect(await screen.findByRole('button', { name: 'Creando…' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.queryByText('Cliente creado')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(await sent(fetchSpy, 'POST')!.clone().json()).toEqual({
      name: 'Ana López',
      email: 'ana@cliente.example',
      company: null,
    })

    respond({ status: 201, body: customerDetail({ id: 'c-ana', name: 'Ana López' }) })
    const region = await screen.findByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Cliente creado')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'c-ana' }))
  })

  it('no envía dos veces si se pulsa Enter mientras guarda', async () => {
    const fetchSpy = mockApi({ 'POST /api/customers': () => new Promise(() => {}) as never })
    renderDialog({ mode: 'create' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Ana')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo' }), 'ana@cliente.example{Enter}')
    await screen.findByRole('button', { name: 'Creando…' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Empresa' }), 'X{Enter}')
    expect(fetchSpy.mock.calls.filter(([input]) => (input as Request).method === 'POST')).toHaveLength(1)
  })

  it('asocia al campo el error de correo duplicado del servidor y no cierra', async () => {
    mockApi({
      'POST /api/customers': {
        status: 400,
        body: {
          status: 400,
          title: 'Datos no válidos',
          errors: [{ field: 'email', message: 'Ya existe un cliente con ese correo.' }],
        },
      },
    })
    const onClose = renderDialog({ mode: 'create' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Ana')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo' }), 'ana@cliente.example')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    const email = screen.getByRole('textbox', { name: 'Correo' })
    await waitFor(() => expect(email).toBeInvalid())
    expect(email).toHaveAccessibleDescription(/Ya existe un cliente con ese correo/)
    expect(email).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('un error de red lo dice dentro del diálogo y deja reintentar', async () => {
    mockApi({ 'POST /api/customers': { status: 500, body: { status: 500, title: 'Error' } } })
    const onClose = renderDialog({ mode: 'create' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), 'Ana')
    await userEvent.type(screen.getByRole('textbox', { name: 'Correo' }), 'ana@cliente.example')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cliente' }))
    expect(await screen.findByText('No se pudo guardar el cliente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear cliente' })).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Cancelar cierra sin enviar nada', async () => {
    const fetchSpy = mockApi({})
    const onClose = renderDialog({ mode: 'create' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('edita con If-Match y envía solo los campos cambiados', async () => {
    const fetchSpy = mockApi({
      'PATCH /api/customers/c-maria': { body: customerDetail({ name: 'María P. Ruiz', version: 4 }) },
    })
    const onClose = renderDialog({ mode: 'edit' })
    const name = screen.getByRole('textbox', { name: 'Nombre' })
    expect(name).toHaveValue('María Pérez')
    await userEvent.clear(name)
    await userEvent.type(name, 'María P. Ruiz')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const region = await screen.findByRole('region', { name: 'Notificaciones' })
    expect(await within(region).findByText('Cambios guardados')).toBeInTheDocument()
    const patch = sent(fetchSpy, 'PATCH')!
    expect(patch.headers.get('If-Match')).toBe('"3"')
    expect(patch.headers.get('Content-Type')).toBe('application/merge-patch+json')
    expect(await patch.clone().json()).toEqual({ name: 'María P. Ruiz' })
    expect(onClose).toHaveBeenCalled()
  })

  it('vaciar la empresa envía null', async () => {
    const fetchSpy = mockApi({ 'PATCH /api/customers/c-maria': { body: customerDetail({ company: null }) } })
    renderDialog({ mode: 'edit' })
    await userEvent.clear(screen.getByRole('textbox', { name: 'Empresa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(sent(fetchSpy, 'PATCH')).toBeDefined())
    expect(await sent(fetchSpy, 'PATCH')!.clone().json()).toEqual({ company: null })
  })

  it('un 412 muestra el aviso ámbar dentro del diálogo y conserva lo escrito', async () => {
    const fetchSpy = mockApi({
      'PATCH /api/customers/c-maria': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
    })
    const onClose = renderDialog({ mode: 'edit' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), ' Ruiz')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const alert = await screen.findByRole('status')
    expect(alert).toHaveTextContent('El cliente cambió mientras lo editabas')
    expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('María Pérez Ruiz')
    expect(sent(fetchSpy, 'PATCH')).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('en edición, si nada cambió, cierra sin enviar', async () => {
    const fetchSpy = mockApi({})
    const onClose = renderDialog({ mode: 'edit' })
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(onClose).toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  describe('con el cliente recargado por la API', () => {
    /** Monta el diálogo con el detalle vivo, como en la página: una recarga tras un 412 le llega por props. */
    function Harness() {
      const customer = useCustomer('c-maria')
      return customer.data ? <CustomerFormDialog open onClose={vi.fn()} mode="edit" customer={customer.data} /> : null
    }
    const patchesTo = (fetchSpy: ReturnType<typeof mockApi>) =>
      fetchSpy.mock.calls.map(([input]) => input as Request).filter((request) => request.method === 'PATCH')

    it('tras un 412 los campos no tocados toman los valores del servidor, los tocados se conservan y el reintento solo envía lo tocado', async () => {
      let reads = 0
      let patches = 0
      const fetchSpy = mockApi({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return { body: customerDetail(reads === 1 ? {} : { company: 'Empresa B', version: 4 }) }
        },
        'PATCH /api/customers/c-maria': () => {
          patches += 1
          return patches === 1
            ? { status: 412, body: { status: 412, title: 'El recurso cambió' } }
            : { body: customerDetail({ name: 'María Pérez Ruiz', company: 'Empresa B', version: 5 }) }
        },
      })
      renderWithProviders(<Harness />)
      await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre' }), ' Ruiz')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByText('El cliente cambió mientras lo editabas')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Empresa B'))
      expect(screen.getByRole('textbox', { name: 'Nombre' })).toHaveValue('María Pérez Ruiz')

      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(patchesTo(fetchSpy)).toHaveLength(2))
      const retry = patchesTo(fetchSpy)[1]!
      expect(retry.headers.get('If-Match')).toBe('"4"')
      expect(await retry.clone().json()).toEqual({ name: 'María Pérez Ruiz' })
    })

    it('un campo tocado que el servidor cambió muestra «Ahora: …» asociado al campo', async () => {
      let reads = 0
      mockApi({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return { body: customerDetail(reads === 1 ? {} : { company: 'Empresa B', version: 4 }) }
        },
        'PATCH /api/customers/c-maria': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
      })
      renderWithProviders(<Harness />)
      const company = await screen.findByRole('textbox', { name: 'Empresa' })
      await userEvent.clear(company)
      await userEvent.type(company, 'Empresa C')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveAccessibleDescription('Ahora: Empresa B'),
      )
      expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveValue('Empresa C')
    })

    it('tras un 412, volver a escribir el valor original de un campo que cambió otra persona lo envía y no cierra sin guardar', async () => {
      let reads = 0
      let patches = 0
      const onClose = vi.fn()
      const fetchSpy = mockApi({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return { body: customerDetail(reads === 1 ? {} : { company: 'Empresa B', version: 4 }) }
        },
        'PATCH /api/customers/c-maria': () => {
          patches += 1
          return patches === 1
            ? { status: 412, body: { status: 412, title: 'El recurso cambió' } }
            : { body: customerDetail({ company: 'Acme Studio', version: 5 }) }
        },
      })
      function Closing() {
        const customer = useCustomer('c-maria')
        return customer.data ? <CustomerFormDialog open onClose={onClose} mode="edit" customer={customer.data} /> : null
      }
      renderWithProviders(<Closing />)
      const company = await screen.findByRole('textbox', { name: 'Empresa' })
      await userEvent.clear(company)
      await userEvent.type(company, 'Empresa C')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Empresa' })).toHaveAccessibleDescription('Ahora: Empresa B'),
      )

      // Vuelve al valor original, que es el que quiere conservar aunque el servidor tenga otro.
      await userEvent.clear(screen.getByRole('textbox', { name: 'Empresa' }))
      await userEvent.type(screen.getByRole('textbox', { name: 'Empresa' }), 'Acme Studio')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      await waitFor(() => expect(patchesTo(fetchSpy)).toHaveLength(2))
      expect(await patchesTo(fetchSpy)[1]!.clone().json()).toEqual({ company: 'Acme Studio' })
      expect(patchesTo(fetchSpy)[1]!.headers.get('If-Match')).toBe('"4"')
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })

    it('el aviso ámbar nombra los campos que cambió otra persona', async () => {
      let reads = 0
      mockApi({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return {
            body: customerDetail(
              reads === 1 ? {} : { company: 'Empresa B', email: 'maria.b@cliente.example', version: 4 },
            ),
          }
        },
        'PATCH /api/customers/c-maria': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
      })
      renderWithProviders(<Harness />)
      await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre' }), ' Ruiz')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      const alert = await screen.findByRole('status')
      await waitFor(() => expect(alert).toHaveTextContent('Cambió: Correo, Empresa.'))
    })

    it('si el cliente pasa a archivado durante la edición muestra el aviso de archivado y no deja guardar', async () => {
      let reads = 0
      mockApi({
        'GET /api/customers/c-maria': () => {
          reads += 1
          return { body: customerDetail(reads === 1 ? {} : { archived: true, version: 4 }) }
        },
        'PATCH /api/customers/c-maria': { status: 412, body: { status: 412, title: 'El recurso cambió' } },
      })
      renderWithProviders(<Harness />)
      await userEvent.type(await screen.findByRole('textbox', { name: 'Nombre' }), ' Ruiz')
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByText('El cliente está archivado')).toBeInTheDocument()
      expect(screen.queryByText('El cliente cambió mientras lo editabas')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    })
  })

  it('un 409 al guardar dice que el cliente está archivado', async () => {
    mockApi({ 'PATCH /api/customers/c-maria': { status: 409, body: { status: 409, title: 'Archivado' } } })
    const onClose = renderDialog({ mode: 'edit' })
    await userEvent.type(screen.getByRole('textbox', { name: 'Nombre' }), ' Ruiz')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('El cliente está archivado')).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})
