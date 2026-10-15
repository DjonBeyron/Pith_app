import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import * as G from './feedSlideGeometry.js'

// Страж «предпросмотр = лента»: числа feedSlideGeometry.js (их используют и лента, и предпросмотр «Как в ленте») совпадают
// с реальным CSS ленты. Поправили отступ в CSS и забыли про геометрию — тест красный.
const css = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const block = (src, sel) => src.match(new RegExp(`${sel.replace(/[.]/g, '\\.')}\\s*\\{[^}]*\\}`))?.[0] ?? ''
const feed = css('../../../styles/feed-v2.css')
const hud = css('../../../styles/feed-hud.css')
const shell = css('../../../styles/shell-v2.css')

describe('геометрия слайда ленты = CSS', () => {
  it('блок фразы: низ 92px + панель; справа 84px', () => {
    const b = block(feed, '.feedPhraseBlock')
    expect(b).toContain(`bottom: calc(${G.PHRASE_BOTTOM}px + var(--v2-nav-h))`)
    expect(b).toContain(`padding: 44px ${G.PHRASE_SIDE_R}px 0 16px`)
  })
  it('кнопка «Изучить фразу»: низ 20px + панель, поля 16px', () => {
    const b = block(feed, '.feedLearnBtn')
    expect(b).toContain(`bottom: calc(${G.LEARN_BOTTOM}px + var(--v2-nav-h))`)
    expect(b).toContain(`left: ${G.LEARN_SIDE}px`)
    expect(b).toContain(`right: ${G.LEARN_SIDE}px`)
    expect(b).toContain('padding: 15px')
  })
  it('HUD: низ 150px + панель; правый отступ = gap 18 − pad 2', () => {
    const b = block(hud, '.feedHud')
    expect(b).toContain(`bottom: calc(${G.HUD_BOTTOM}px + var(--v2-nav-h))`)
    expect(b).toContain('--hud-gap: 18px')
    expect(b).toContain('--hud-pad-x: 2px')
    expect(G.HUD_RIGHT).toBe(18 - 2)
    expect(hud).toMatch(/\.feedHudBtn svg \{ width: 31px/)
    expect(G.HUD_W).toBe(31)
  })
  it('нижняя панель: кнопки 40px, safe-area снизу прибавляется', () => {
    expect(shell).toContain(`--v2-nav-btn-h: ${G.NAV_BTN_H}px`)
    expect(G.navHeight(0)).toBe(40)
    expect(G.navHeight(34)).toBe(74)
    expect(G.navHeight(-5)).toBe(40)
  })
  it('экраны предпросмотра: iPhone/12 mini/Android/Pro Max + окно Safari; у каждого размеры и safe-area', () => {
    expect(G.FEED_DEVICES.map(d => `${d.w}×${d.h}`)).toEqual(['390×844', '375×812', '360×780', '430×932', '390×664'])
    for (const d of G.FEED_DEVICES) expect(d.sab).toBeGreaterThanOrEqual(0)
  })
})
