import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findLooseQueryKeys } from './check-query-keys.mjs'

const loose = {
  'comillas simples': "useQuery({ queryKey: ['tickets', 'x'] })",
  'comillas dobles': 'useQuery({ queryKey: ["tickets", "x"] })',
  multilínea: "useQuery({\n  queryKey: [\n    'tickets',\n    'x',\n  ],\n})",
  spread: "useQuery({ queryKey: [...ticketKeys.all, 'x'] })",
  'as const': "useQuery({ queryKey: ['tickets'] as const })",
  paréntesis: "useQuery({ queryKey: (['tickets']) })",
  'propiedad entrecomillada': "useQuery({ 'queryKey': ['tickets'] })",
  invalidateQueries: "queryClient.invalidateQueries({ queryKey: ['tickets'] })",
}
for (const [name, code] of Object.entries(loose)) {
  test(`rechaza ${name}`, () => assert.equal(findLooseQueryKeys(code).length, 1))
}

const allowed = {
  'uso de la fábrica': 'useQuery({ queryKey: ticketKeys.list(params) })',
  'propiedad de la fábrica': 'useQuery({ queryKey: sessionKeys.me })',
  variable: 'useQuery({ queryKey: key })',
  'fábrica con spread':
    "export const ticketKeys = { all: ['tickets'] as const, lists: () => [...ticketKeys.all, 'list'] as const }",
  'otra propiedad con array': "useQuery({ select: ['a'], enabled: true })",
}
for (const [name, code] of Object.entries(allowed)) {
  test(`acepta ${name}`, () => assert.deepEqual(findLooseQueryKeys(code), []))
}

test('informa línea y columna', () => {
  assert.deepEqual(findLooseQueryKeys("a()\nuseQuery({\n  queryKey: ['x'],\n})"), [{ line: 3, column: 3 }])
})

test('analiza TSX', () => {
  assert.equal(findLooseQueryKeys("const A = () => <div>{useQuery({ queryKey: ['x'] })}</div>", 'a.tsx').length, 1)
})
