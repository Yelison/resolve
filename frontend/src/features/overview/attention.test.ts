import { describe, expect, it } from 'vitest'
import { summary } from '../../test/ticketFixtures'
import type { TicketSummary } from '../../domain/ticket'
import { selectAttention } from './attention'

const NOW = new Date('2026-10-10T12:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const ME = 'u-laura'

const ticket = (number: number, overrides: Partial<TicketSummary> = {}) =>
  summary({
    id: `t-${number}`,
    number,
    priority: 'medium',
    status: 'in_progress',
    createdAt: ago(60 * 48),
    updatedAt: ago(30),
    ...overrides,
  })

const customerMessage = (minutes: number) => ({
  excerpt: 'Sigue sin funcionar',
  authorName: 'María Pérez',
  internal: false,
  createdAt: ago(minutes),
})

const agentMessage = (minutes: number) => ({
  excerpt: 'Ya lo revisamos',
  authorName: 'Laura Méndez',
  internal: false,
  createdAt: ago(minutes),
})

const reasonOf = (candidate: TicketSummary, userId: string | undefined = ME) =>
  selectAttention([candidate], NOW, userId).items[0]

describe('selectAttention · motivos', () => {
  it('urgente manda sobre cualquier otro motivo', () => {
    const item = reasonOf(ticket(1, { priority: 'urgent', status: 'open', assignee: null, lastMessage: null }))
    expect(item).toMatchObject({ reason: 'urgent', label: 'Urgente' })
  })

  it('un ticket nuevo sin mensajes desde hace horas está sin respuesta, con el plazo en horas', () => {
    const item = reasonOf(ticket(2, { status: 'open', createdAt: ago(60 * 3 + 20), lastMessage: null }))
    expect(item).toMatchObject({ reason: 'unanswered', detail: 'Sin respuesta desde hace 3 h' })
  })

  it('un ticket nuevo del cliente con menos de 1 h todavía no es motivo', () => {
    expect(reasonOf(ticket(3, { status: 'open', createdAt: ago(59), lastMessage: null }))).toBeUndefined()
  })

  it('los días de espera pasan a días a partir de 48 h', () => {
    const item = reasonOf(ticket(4, { status: 'open', createdAt: ago(60 * 24 * 3), lastMessage: null }))
    expect(item?.detail).toBe('Sin respuesta desde hace 3 días')
  })

  it('un ticket nuevo cuyo último mensaje es del agente no está sin respuesta', () => {
    const lastMessage = agentMessage(60 * 5)
    expect(reasonOf(ticket(5, { status: 'open', lastMessage }))).toBeUndefined()
  })

  it('sin responsable es un motivo, y la acción es asignármelo', () => {
    const item = reasonOf(ticket(6, { assignee: null, lastMessage: agentMessage(10) }))
    expect(item).toMatchObject({ reason: 'unassigned', label: 'Sin asignar', action: 'assign' })
  })

  it('el cliente respondió en un ticket en curso, con cuánto hace', () => {
    const item = reasonOf(ticket(7, { lastMessage: customerMessage(40) }))
    expect(item).toMatchObject({
      reason: 'customerReplied',
      detail: 'El cliente respondió hace 40 min',
      action: 'open',
    })
  })

  it('una nota interna al final no cuenta como respuesta del cliente', () => {
    const lastMessage = { ...customerMessage(40), internal: true }
    expect(reasonOf(ticket(8, { lastMessage }))).toBeUndefined()
  })

  it('un mensaje de un agente con el mismo asunto no se confunde con el del cliente', () => {
    expect(reasonOf(ticket(9, { lastMessage: agentMessage(40) }))).toBeUndefined()
  })

  it('prioridad alta es un motivo', () => {
    expect(reasonOf(ticket(10, { priority: 'high', lastMessage: agentMessage(5) }))).toMatchObject({
      reason: 'high',
      label: 'Alta',
      action: 'open',
    })
  })

  it('esperando al cliente cuenta desde 1 día, no antes', () => {
    expect(reasonOf(ticket(11, { status: 'waiting', updatedAt: ago(60 * 23) }))).toBeUndefined()
    expect(reasonOf(ticket(11, { status: 'waiting', updatedAt: ago(60 * 24 * 5 + 30) }))).toMatchObject({
      reason: 'waiting',
      detail: 'Esperando al cliente 5 días',
    })
    expect(reasonOf(ticket(11, { status: 'waiting', updatedAt: ago(60 * 24) }))?.detail).toBe(
      'Esperando al cliente 1 día',
    )
  })

  it('los resueltos no necesitan atención aunque sean urgentes', () => {
    expect(reasonOf(ticket(12, { status: 'resolved', priority: 'urgent' }))).toBeUndefined()
  })
})

describe('selectAttention · acción', () => {
  it('«Responder» solo cuando es tuyo y es urgente o está sin respuesta', () => {
    const mine = { id: ME, name: 'Laura Méndez' }
    const other = { id: 'u-daniel', name: 'Daniel Santos' }
    expect(reasonOf(ticket(1, { priority: 'urgent', assignee: mine }))?.action).toBe('reply')
    expect(
      reasonOf(ticket(2, { status: 'open', assignee: mine, lastMessage: null, createdAt: ago(300) }))?.action,
    ).toBe('reply')
    expect(reasonOf(ticket(3, { priority: 'urgent', assignee: other }))?.action).toBe('open')
    expect(reasonOf(ticket(4, { priority: 'high', assignee: mine }))?.action).toBe('open')
    expect(reasonOf(ticket(5, { priority: 'urgent', assignee: null }))?.action).toBe('assign')
  })

  it('sin sesión nunca ofrece «Responder»', () => {
    expect(selectAttention([ticket(1, { priority: 'urgent' })], NOW, undefined).items[0]?.action).toBe('open')
  })
})

describe('selectAttention · orden y límite', () => {
  it('ordena por motivo y, dentro de cada uno, el que más lleva esperando primero', () => {
    const tickets = [
      ticket(1, { priority: 'high', lastMessage: agentMessage(5) }),
      ticket(2, { status: 'waiting', updatedAt: ago(60 * 24 * 5) }),
      ticket(3, { priority: 'urgent', createdAt: ago(30) }),
      ticket(4, { priority: 'urgent', createdAt: ago(600) }),
      ticket(5, { lastMessage: customerMessage(10) }),
      ticket(6, { status: 'open', createdAt: ago(60 * 6), lastMessage: null }),
      ticket(7, { assignee: null }),
    ]
    expect(selectAttention(tickets, NOW, ME, 10).items.map((item) => [item.ticket.number, item.reason])).toEqual([
      [4, 'urgent'],
      [3, 'urgent'],
      [6, 'unanswered'],
      [7, 'unassigned'],
      [5, 'customerReplied'],
      [1, 'high'],
      [2, 'waiting'],
    ])
  })

  it('recorta a 6 y dice cuántos tienen motivo', () => {
    const many = Array.from({ length: 9 }, (_, index) => ticket(100 + index, { priority: 'urgent' }))
    const quiet = ticket(1, { lastMessage: agentMessage(5) })
    const result = selectAttention([...many, quiet], NOW, ME)
    expect(result.items).toHaveLength(6)
    expect(result.withReason).toBe(9)
  })

  it('con pocos tickets no rellena: muestra los que tienen motivo', () => {
    const result = selectAttention([ticket(1, { priority: 'urgent' }), ticket(2)], NOW, ME)
    expect(result.items.map((item) => item.ticket.number)).toEqual([1])
  })
})
