import { describe, expect, it } from 'vitest'
import type { AttentionItem, AttentionReasonKind } from '../../api/schema'
import { describeAttention, inboxLink, reasonLabels } from './attention'

const NOW = new Date('2026-10-10T12:00:00Z')
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()
const ME = 'u-laura'
const mine = { id: ME, name: 'Laura Méndez' }
const other = { id: 'u-daniel', name: 'Daniel Santos' }

/** Un elemento como lo devuelve el servidor: él decide el motivo, el cliente solo lo escribe. */
const item = (
  kind: AttentionReasonKind,
  overrides: { since?: string; excerpt?: string | null; assignee?: AttentionItem['ticket']['assignee'] } = {},
): AttentionItem => ({
  ticket: {
    id: 't-1',
    number: 1,
    subject: 'No puedo acceder a mi cuenta',
    status: 'open',
    priority: 'medium',
    customer: { id: 'c-1', name: 'María Pérez', email: 'maria@cliente.example', company: null },
    assignee: overrides.assignee === undefined ? mine : overrides.assignee,
    updatedAt: ago(30),
  },
  reason: { kind, since: overrides.since ?? ago(60), excerpt: overrides.excerpt ?? null },
})

const describe_ = (candidate: AttentionItem, userId: string | undefined = ME) =>
  describeAttention(candidate, NOW, userId)

describe('describeAttention · motivo', () => {
  it('cada motivo tiene su etiqueta corta', () => {
    expect(reasonLabels).toEqual({
      urgent: 'Urgente',
      unanswered: 'Sin respuesta',
      unassigned: 'Sin asignar',
      customer_replied: 'Respondió',
      high: 'Alta',
      waiting: 'Esperando',
    })
    for (const kind of Object.keys(reasonLabels) as AttentionReasonKind[]) {
      expect(describe_(item(kind)).label).toBe(reasonLabels[kind])
    }
  })

  it('urgente, sin asignar y alta no llevan detalle: la etiqueta lo dice todo', () => {
    for (const kind of ['urgent', 'unassigned', 'high'] as const) {
      expect(describe_(item(kind, { since: ago(60 * 40) })).detail).toBeUndefined()
    }
  })

  it('sin respuesta dice desde cuándo, con el plazo en horas', () => {
    expect(describe_(item('unanswered', { since: ago(60 * 3 + 20) })).detail).toBe('Sin respuesta desde hace 3 h')
  })

  it('los plazos pasan a días a partir de 48 h', () => {
    expect(describe_(item('unanswered', { since: ago(60 * 47) })).detail).toBe('Sin respuesta desde hace 47 h')
    expect(describe_(item('unanswered', { since: ago(60 * 24 * 3) })).detail).toBe('Sin respuesta desde hace 3 días')
  })

  it('el cliente respondió dice cuánto hace', () => {
    expect(describe_(item('customer_replied', { since: ago(40) })).detail).toBe('El cliente respondió hace 40 min')
  })

  it('esperando al cliente cuenta días enteros, redondeando hacia abajo', () => {
    expect(describe_(item('waiting', { since: ago(60 * 24) })).detail).toBe('Esperando al cliente 1 día')
    expect(describe_(item('waiting', { since: ago(60 * 24 * 5 + 30) })).detail).toBe('Esperando al cliente 5 días')
  })
})

describe('describeAttention · acción', () => {
  it('«Responder» solo cuando es tuyo y es urgente o está sin respuesta', () => {
    expect(describe_(item('urgent')).action).toBe('reply')
    expect(describe_(item('unanswered')).action).toBe('reply')
    expect(describe_(item('urgent', { assignee: other })).action).toBe('open')
    expect(describe_(item('unanswered', { assignee: other })).action).toBe('open')
    for (const kind of ['customer_replied', 'high', 'waiting'] as const) {
      expect(describe_(item(kind)).action).toBe('open')
    }
  })

  it('«Asignármelo» en lo que nadie tiene, sea cual sea el motivo', () => {
    for (const kind of Object.keys(reasonLabels) as AttentionReasonKind[]) {
      expect(describe_(item(kind, { assignee: null })).action).toBe('assign')
    }
  })

  it('sin sesión nunca ofrece «Responder»', () => {
    expect(describeAttention(item('urgent'), NOW, undefined).action).toBe('open')
  })
})

describe('inboxLink', () => {
  it('lleva a la bandeja con el mismo alcance, de más a menos prioritarios', () => {
    expect(inboxLink('mine')).toBe('/tickets?view=mine&sort=priority,desc')
    expect(inboxLink('team')).toBe('/tickets?sort=priority,desc')
  })
})
