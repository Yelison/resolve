import { describe, expect, it } from 'vitest'
import { customersMock } from '../../../e2e/mocks/customers'
import { attentionOf, tickets } from '../../../e2e/mocks/tickets'

/**
 * La demostración y los e2e sirven «Necesitan atención» desde `e2e/mocks/tickets.ts`: debe decidir como el servidor
 * (`TicketAttentionQuery`) con los mismos tickets y mensajes de siempre.
 */
const customers = customersMock(() => tickets)
const bare = tickets.map(({ lastMessage: _lastMessage, ...rest }) => rest)
const list = (scope: 'mine' | 'team', size = 6) => attentionOf(bare, customers.customerRef, scope, size)

describe('mock de «Necesitan atención»', () => {
  it('para todo el equipo: urgente, sin asignar y respondió, cada uno con su motivo', () => {
    const result = list('team')
    expect(result.items.map((item) => [item.ticket.number, item.reason.kind])).toEqual([
      [1048, 'urgent'],
      [1046, 'unassigned'],
      [1047, 'customer_replied'],
    ])
    expect(result.total).toBe(3)
    expect(result.open).toBe(3)
  })

  it('una nota interna al final del #1047 no oculta que el cliente escribió el último mensaje público', () => {
    // La conversación del #1047 termina en una nota de Daniel: sigue siendo «el cliente respondió», no «alta».
    const item = list('team').items.find((candidate) => candidate.ticket.number === 1047)!
    expect(item.reason.kind).toBe('customer_replied')
    expect(item.reason.excerpt).toBe('El cargo aparece rechazado aunque el banco dice que está aprobado.')
  })

  it('solo «el cliente respondió» lleva extracto, con el último mensaje público del cliente', () => {
    const excerpts = list('team').items.map((item) => item.reason.excerpt)
    expect(excerpts).toEqual([null, null, 'El cargo aparece rechazado aunque el banco dice que está aprobado.'])
  })

  it('cada motivo dice desde cuándo, con fechas ISO', () => {
    for (const item of list('team').items) expect(new Date(item.reason.since).toISOString()).toBe(item.reason.since)
  })

  it('«Para mí» son los asignados a quien consulta: nadie tiene la demostración asignada al administrador', () => {
    const result = list('mine')
    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
    expect(result.open).toBe(0)
  })

  it('`size` recorta los elementos pero no los recuentos', () => {
    const result = list('team', 1)
    expect(result.items.map((item) => item.ticket.number)).toEqual([1048])
    expect(result.total).toBe(3)
    expect(result.open).toBe(3)
  })
})
