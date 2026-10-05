import { describe, expect, it } from 'vitest'
import { readingTimeMinutes } from './readingTime'

const words = (count: number) => Array.from({ length: count }, () => 'palabra').join(' ')

describe('readingTimeMinutes', () => {
  it('redondea hacia arriba: 450 palabras son 3 minutos', () => {
    expect(readingTimeMinutes(words(450))).toBe(3)
  })

  it('no baja de 1 minuto, ni con el texto vacío', () => {
    expect(readingTimeMinutes('')).toBe(1)
    expect(readingTimeMinutes(words(5))).toBe(1)
  })

  it('200 palabras son 1 minuto y 201 son 2', () => {
    expect(readingTimeMinutes(words(200))).toBe(1)
    expect(readingTimeMinutes(words(201))).toBe(2)
  })

  it('cuenta las palabras separadas por saltos de línea', () => {
    expect(readingTimeMinutes(`${words(150)}\n\n${words(150)}`)).toBe(2)
  })
})
