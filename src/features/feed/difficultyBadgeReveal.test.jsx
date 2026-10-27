import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import DifficultyBadge from './DifficultyBadge.jsx'

// Значок сложности скрыт до первого прослушивания со звуком, потом плавно проявляется (B2, решение 6)
const html = revealed => renderToStaticMarkup(<DifficultyBadge level={2} myVote={null} onVote={() => true} revealed={revealed} />)
const css = readFileSync(fileURLToPath(new URL('../../styles/difficulty-reveal.css', import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

describe('значок сложности: проявление после первого прослушивания', () => {
  it('revealed=false — класс diffHidden, кнопка в разметке остаётся (колонка не прыгает)', () => {
    const out = html(false)
    expect(out).toContain('class="diffWrap diffHidden"')
    expect(out).toContain('aria-label="Сложность фразы"')
  })
  it('revealed=true — класс diffReveal', () => {
    expect(html(true)).toContain('class="diffWrap diffReveal"')
  })
  it('по умолчанию (админский предпросмотр, «Мои уроки») значок виден', () => {
    const out = renderToStaticMarkup(<DifficultyBadge level={null} myVote={null} onVote={() => true} />)
    expect(out).toContain('diffReveal')
    expect(out).not.toContain('diffHidden')
  })
  it('CSS: скрытый — opacity 0 и visibility hidden; проявление — переход opacity 0.6 с', () => {
    expect(css).toMatch(/\.diffHidden\s*\{[^}]*opacity:\s*0[^}]*visibility:\s*hidden/)
    expect(css).toMatch(/\.diffReveal\s*\{[^}]*transition:\s*opacity 0\.6s/)
  })
})
