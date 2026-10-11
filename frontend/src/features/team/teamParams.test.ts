import { describe, expect, it } from 'vitest'
import { teamMember } from './teamFixtures'
import {
  filterMembers,
  hasActiveTeamFilters,
  readTeamState,
  teamPageCount,
  writeTeamState,
  type TeamPageState,
} from './teamParams'

const base: TeamPageState = { q: '', page: 1, allLoad: false, loadTable: false }

describe('estado de la página en la URL', () => {
  it('sin parámetros es el estado por defecto', () => {
    expect(readTeamState(new URLSearchParams())).toEqual({
      q: '',
      role: undefined,
      status: undefined,
      page: 1,
      allLoad: false,
      loadTable: false,
    })
  })

  it('lee y escribe cada parámetro con los nombres de la URL', () => {
    const state: TeamPageState = {
      q: 'laura',
      role: 'admin',
      status: 'invited',
      page: 3,
      allLoad: true,
      loadTable: true,
    }
    const params = writeTeamState(state)
    expect(params.toString()).toBe('q=laura&rol=administrador&estado=invitados&pagina=3&carga=todas&vista=tabla')
    expect(readTeamState(params)).toEqual(state)
  })

  it('mantiene el enlace antiguo de retirados', () => {
    expect(readTeamState(new URLSearchParams('estado=retirados')).status).toBe('removed')
    expect(writeTeamState({ ...base, status: 'removed' }).toString()).toBe('estado=retirados')
  })

  it('ignora valores desconocidos y páginas no válidas', () => {
    expect(readTeamState(new URLSearchParams('rol=jefe&estado=raro&pagina=0&carga=algunas'))).toEqual(base)
    expect(readTeamState(new URLSearchParams('pagina=abc')).page).toBe(1)
  })

  it('solo escribe lo que difiere del estado por defecto', () => {
    expect(writeTeamState(base).toString()).toBe('')
    expect(writeTeamState({ ...base, q: '  ' }).toString()).toBe('')
  })

  it('distingue los filtros de la lista de la carga desplegada y la página', () => {
    expect(hasActiveTeamFilters({ ...base, allLoad: true, loadTable: true, page: 2 })).toBe(false)
    expect(hasActiveTeamFilters({ ...base, q: 'a' })).toBe(true)
    expect(hasActiveTeamFilters({ ...base, role: 'agent' })).toBe(true)
    expect(hasActiveTeamFilters({ ...base, status: 'active' })).toBe(true)
  })
})

describe('filterMembers', () => {
  const members = [
    teamMember({ id: 'a', name: 'María Pérez', email: 'maria@acme.example' }),
    teamMember({ id: 'b', name: 'Daniel Santos', email: 'daniel@acme.example', role: 'admin' }),
    teamMember({ id: 'c', name: 'Sofía Ríos', email: 'sofia@acme.example', status: 'invited' }),
    teamMember({ id: 'd', name: 'Pablo Viejo', email: 'pablo@acme.example', status: 'removed' }),
  ]
  const ids = (state: TeamPageState) => filterMembers(members, state).map((member) => member.id)

  it('por defecto oculta a los retirados', () => {
    expect(ids(base)).toEqual(['a', 'b', 'c'])
  })

  it('filtra por estado, incluida la invitación pendiente y los retirados', () => {
    expect(ids({ ...base, status: 'active' })).toEqual(['a', 'b'])
    expect(ids({ ...base, status: 'invited' })).toEqual(['c'])
    expect(ids({ ...base, status: 'removed' })).toEqual(['d'])
  })

  it('filtra por rol y combina los filtros', () => {
    expect(ids({ ...base, role: 'admin' })).toEqual(['b'])
    expect(ids({ ...base, role: 'agent', status: 'invited' })).toEqual(['c'])
  })

  it('busca por nombre o correo sin distinguir mayúsculas ni tildes', () => {
    expect(ids({ ...base, q: 'MARIA' })).toEqual(['a'])
    expect(ids({ ...base, q: 'rios' })).toEqual(['c'])
    expect(ids({ ...base, q: 'daniel@acme' })).toEqual(['b'])
    expect(ids({ ...base, q: 'nadie' })).toEqual([])
  })
})

describe('teamPageCount', () => {
  it('cuenta páginas de diez y siempre al menos una', () => {
    expect([0, 1, 10, 11, 28].map(teamPageCount)).toEqual([1, 1, 1, 2, 3])
  })
})
