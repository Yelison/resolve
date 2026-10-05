import { describe, expect, it } from 'vitest'
import { draftKey, parseDraft, serializeDraft } from './articleDraft'

describe('articleDraft', () => {
  it('recupera lo que serializa', () => {
    const draft = { title: 'Hola', body: 'Texto\ncon líneas', version: 3 }
    expect(parseDraft(serializeDraft(draft))).toEqual(draft)
  })

  it.each(['', 'texto suelto', '{', 'null', '[]', '{"title":"a","body":"b"}', '{"title":1,"body":"b","version":1}'])(
    'ignora %j',
    (raw) => {
      expect(parseDraft(raw)).toBeNull()
    },
  )

  it('usa una clave por artículo y otra para el nuevo', () => {
    expect(draftKey(undefined)).toBe('resolve-article-nuevo')
    expect(draftKey('mi-articulo')).toBe('resolve-article-mi-articulo')
  })
})
