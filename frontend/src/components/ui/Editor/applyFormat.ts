export type TextFormat = 'bold' | 'italic' | 'list' | 'link'

export interface TextEdit {
  value: string
  selectionStart: number
  selectionEnd: number
}

const wrappers: Record<'bold' | 'italic', string> = { bold: '**', italic: '_' }

/**
 * Aplica formato Markdown a la selección de un textarea y devuelve el texto y la nueva selección.
 * Sin selección inserta los marcadores y deja el cursor entre ellos.
 */
export function applyFormat(text: string, start: number, end: number, format: TextFormat): TextEdit {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  if (format === 'bold' || format === 'italic') {
    const mark = wrappers[format]
    return {
      value: `${before}${mark}${selected}${mark}${after}`,
      selectionStart: start + mark.length,
      selectionEnd: end + mark.length,
    }
  }

  if (format === 'link') {
    const label = selected || 'texto'
    const value = `${before}[${label}](https://)${after}`
    // Deja seleccionada la URL para escribirla directamente.
    const urlStart = start + label.length + 3
    return { value, selectionStart: urlStart, selectionEnd: urlStart + 'https://'.length }
  }

  // Lista: antepone «- » a cada línea tocada por la selección.
  const lineStart = before.lastIndexOf('\n') + 1
  const block = text.slice(lineStart, end)
  const lines = block.split('\n')
  const listed = lines.map((line) => (line.startsWith('- ') ? line : `- ${line}`)).join('\n')
  const added = listed.length - block.length
  return {
    value: `${text.slice(0, lineStart)}${listed}${after}`,
    selectionStart: start + (lines[0]?.startsWith('- ') ? 0 : 2),
    selectionEnd: end + added,
  }
}
