import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DemoBanner } from './DemoBanner'

/** jsdom no mide ni observa: el observador de prueba avisa al observar y la altura se fija a mano. */
function stubLayout(height: number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe() {
        this.callback()
      }
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(height)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('DemoBanner', () => {
  it('publica su altura como --demo-banner-height en :root y la retira al desmontarse', () => {
    stubLayout(52)
    const { unmount } = render(<DemoBanner />)
    const root = document.documentElement
    expect(root.style.getPropertyValue('--demo-banner-height')).toBe('52px')
    expect(root.style.scrollPaddingBottom).toBe('52px')
    unmount()
    expect(root.style.getPropertyValue('--demo-banner-height')).toBe('')
    expect(root.style.scrollPaddingBottom).toBe('')
  })
})
