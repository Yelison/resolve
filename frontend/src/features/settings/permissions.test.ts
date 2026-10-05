import { describe, expect, it } from 'vitest'
import { roleValues } from '../../api/schema'
import { accessLabels, capabilities, groupBySection, matrixRoles, type Access } from './permissions'

const A: Access = 'allowed'
const O: Access = 'own'
const L: Access = 'limited'
const N: Access = 'no'

/**
 * Tabla de verdad escrita a mano a partir de §3.7 del plan («Seguridad y permisos por endpoint»), una fila por grupo
 * de endpoints: [administrador, agente, cliente]. Si alguien cambia `permissions.ts` sin cambiar el servidor (o al
 * revés), esta tabla es donde se nota.
 */
const truthTable: Record<string, [Access, Access, Access]> = {
  'tickets.read': [A, A, O], // GET /tickets, /tickets/{n}, /tickets/{n}/messages: cliente «own / public only»
  'tickets.write': [A, A, N], // POST /tickets, PATCH /tickets/{n}, POST …/messages
  'tickets.insights': [A, A, N], // GET …/activity, /tickets/activity, /tickets/metrics
  'customers.manage': [A, A, N], // GET /customers/*, POST /customers, PATCH /customers/{id}
  'customers.access': [A, N, N], // POST /customers/{id}/archive, /restore, /invite
  'team.read': [A, A, N], // GET /members, /members/metrics
  'team.manage': [A, N, N], // POST /members, …/role, …/remove
  'reports.read': [A, A, N], // GET /reports/summary
  'knowledge.read': [A, A, L], // GET /knowledge/*: cliente «published and public only»
  'knowledge.write': [A, A, N], // POST /knowledge/articles, PATCH, publish, unpublish
  'knowledge.categories': [A, N, N], // POST /knowledge/categories
  'settings.read': [A, A, N], // GET /organization
  'settings.write': [A, N, N], // PATCH /organization
  'settings.profile': [A, A, A], // PATCH /me
}

describe('permissions', () => {
  it('coincide con la tabla de verdad de §3.7, capacidad por capacidad', () => {
    const actual = Object.fromEntries(
      capabilities.map(({ key, access }) => [key, matrixRoles.map((role) => access[role])]),
    )
    expect(actual).toEqual(truthTable)
  })

  it('las columnas son los tres roles del contrato, en el orden Administrador, Agente, Cliente', () => {
    expect(matrixRoles).toEqual(['admin', 'agent', 'customer'])
    expect([...matrixRoles].sort()).toEqual([...roleValues].sort())
  })

  it('cada capacidad define un acceso para cada rol, con un texto visible', () => {
    for (const capability of capabilities) {
      for (const role of roleValues) expect(accessLabels[capability.access[role]]).toBeTruthy()
    }
  })

  it('las claves no se repiten y todo tiene etiqueta y sección', () => {
    const keys = capabilities.map(({ key }) => key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const { label, section } of capabilities) {
      expect(label.trim()).not.toBe('')
      expect(section.trim()).not.toBe('')
    }
  })

  it('un cliente nunca tiene un acceso total salvo cambiar su propio nombre', () => {
    const full = capabilities.filter(({ access }) => access.customer === 'allowed').map(({ key }) => key)
    expect(full).toEqual(['settings.profile'])
  })

  it('el administrador puede todo lo que puede el agente', () => {
    for (const { key, access } of capabilities) {
      if (access.agent !== 'no') expect(access.admin, key).toBe('allowed')
    }
  })

  it('agrupa por sección conservando el orden y sin perder capacidades', () => {
    const sections = groupBySection()
    expect(sections.map(({ name }) => name)).toEqual([
      'Tickets',
      'Clientes',
      'Equipo',
      'Reportes',
      'Conocimiento',
      'Configuración',
    ])
    expect(sections.flatMap((section) => section.capabilities)).toEqual(capabilities)
  })
})
