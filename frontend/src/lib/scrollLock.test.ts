import { afterEach, describe, expect, it } from 'vitest'
import { lockScroll } from './scrollLock'

describe('lockScroll', () => {
  afterEach(() => {
    document.documentElement.className = ''
  })

  it('mantiene el bloqueo hasta liberar el último overlay', () => {
    const releaseModal = lockScroll()
    const releaseMenu = lockScroll()
    releaseMenu()
    expect(document.documentElement).toHaveClass('scroll-locked')
    releaseModal()
    expect(document.documentElement).not.toHaveClass('scroll-locked')
  })

  it('ignora liberaciones repetidas', () => {
    const releaseA = lockScroll()
    const releaseB = lockScroll()
    releaseA()
    releaseA()
    expect(document.documentElement).toHaveClass('scroll-locked')
    releaseB()
    expect(document.documentElement).not.toHaveClass('scroll-locked')
  })
})
