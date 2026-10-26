import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PitAvatar from './PitAvatar.jsx'

describe('PitAvatar', () => {
  it('одна картинка нужного размера, без alt-шума, перетаскивание выключено', () => {
    const html = renderToStaticMarkup(<PitAvatar size={42} className="x" />)
    expect(html).toContain('<img ')
    expect(html).toContain('width="42"'); expect(html).toContain('height="42"'); expect(html).toContain('class="x"')
    expect(html).toContain('alt=""'); expect(html).toContain('draggable="false"')
    expect(html).toMatch(/src="[^"]+\.webp|src="data:image\/webp/)
  })
})
