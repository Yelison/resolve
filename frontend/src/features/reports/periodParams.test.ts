import { describe, expect, it } from 'vitest'
import { DEFAULT_PERIOD, hasInvalidPeriod, readPeriod, writePeriod } from './periodParams'

describe('readPeriod', () => {
  it.each([
    ['', DEFAULT_PERIOD],
    ['period=30d', '30d'],
    ['period=90d', '90d'],
    ['period=7d', '7d'],
    ['period=foo', DEFAULT_PERIOD],
    ['period=', DEFAULT_PERIOD],
    ['period=30D', DEFAULT_PERIOD],
    ['period=30d&period=90d', '30d'],
  ])('lee «%s» como %s', (query, expected) => {
    expect(readPeriod(new URLSearchParams(query))).toBe(expected)
  })
})

describe('hasInvalidPeriod', () => {
  it('solo es cierto si el parámetro está y no es un periodo admitido', () => {
    expect(hasInvalidPeriod(new URLSearchParams(''))).toBe(false)
    expect(hasInvalidPeriod(new URLSearchParams('period=30d'))).toBe(false)
    expect(hasInvalidPeriod(new URLSearchParams('period=foo'))).toBe(true)
    expect(hasInvalidPeriod(new URLSearchParams('period='))).toBe(true)
  })
})

describe('writePeriod', () => {
  it('escribe el periodo y omite el de por defecto', () => {
    expect(writePeriod(new URLSearchParams(), '30d').toString()).toBe('period=30d')
    expect(writePeriod(new URLSearchParams('period=30d'), '7d').toString()).toBe('')
  })

  it('conserva los demás parámetros y no modifica el original', () => {
    const original = new URLSearchParams('x=1&period=foo')
    expect(writePeriod(original, '90d').toString()).toBe('x=1&period=90d')
    expect(original.toString()).toBe('x=1&period=foo')
  })
})
