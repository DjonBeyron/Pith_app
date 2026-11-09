import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createBands } from './wordLaneMirrorBands.js'
import { runMirrorScene } from './wordLaneMirrorScene.js'
import { compareLayout, TAG_PIT, TAG_YOU } from '../../../rehearsal/mirror/mirrorCompare.js'
import { CHUNKS } from '../../../rehearsal/mirror/mirrorFixtures.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Подставной DOM: поле с двумя подложками; fill.animate записывает вызовы
function fakeField() {
  const make = () => {
    const attrs = new Map(), props = new Map()
    const anims = []
    const fill = { animate: vi.fn((kf, opts) => { const a = { kf, opts, cancel: vi.fn() }; anims.push(a); return a }) }
    return { attrs, props, anims, fill, firstElementChild: fill, setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: n => attrs.delete(n), style: { setProperty: (n, v) => props.set(n, v), removeProperty: n => props.delete(n) } }
  }
  const bands = { pit: make(), you: make() }
  return { bands, querySelector: sel => bands[/data-band="(\w+)"/.exec(sel)?.[1]] ?? null }
}
const layout = student => compareLayout({ chunks: CHUNKS, student })

describe('горизонтальные подложки зеркала', () => {
  it('включаются с подписью и высотой ленты: «Пит» сверху, «Твоя фраза» снизу; записи нет — нижней подложки нет', () => {
    const f = fakeField()
    createBands(f, layout({ url: 'blob:x' }))
    expect(f.bands.pit.attrs.get('data-tag')).toBe(TAG_PIT); expect(f.bands.you.attrs.get('data-tag')).toBe(TAG_YOU)
    expect(TAG_YOU).toBe('Твоя фраза'); expect(f.bands.pit.attrs.has('data-on')).toBe(true)
    expect(Number(f.bands.pit.props.get('--by'))).toBeLessThan(Number(f.bands.you.props.get('--by')))
    const g = fakeField()
    createBands(g, layout(null))
    expect(g.bands.pit.attrs.has('data-on')).toBe(true); expect(g.bands.you.attrs.has('data-on')).toBe(false)
  })
  it('fill: линейная заливка scaleX 0 → 1 на время звука, с задержкой; повторный fill снимает прежнюю; clear и stop гасят всё', () => {
    const f = fakeField()
    const b = createBands(f, layout({ url: 'blob:x' }))
    b.fill('pit', { delayMs: 25, durationMs: 1800 })
    const a = f.bands.pit.anims[0]
    expect(a.kf).toEqual([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }])
    expect(a.opts).toMatchObject({ duration: 1800, delay: 25, easing: 'linear', fill: 'both' })
    b.fill('pit', { durationMs: 900 })
    expect(a.cancel).toHaveBeenCalledTimes(1); expect(f.bands.pit.anims).toHaveLength(2)
    b.fill('you', { durationMs: 2600 })
    expect(f.bands.you.anims[0].opts.duration).toBe(2600)
    b.fill('pit', { durationMs: 0 }) // нулевая длина — заливки нет, прежняя снята
    expect(f.bands.pit.anims[1].cancel).toHaveBeenCalled(); expect(f.bands.pit.anims).toHaveLength(2)
    b.clear(); expect(f.bands.you.anims[0].cancel).toHaveBeenCalled()
    b.stop(); expect(f.bands.pit.attrs.has('data-on')).toBe(false); expect(f.bands.pit.props.has('--by')).toBe(false)
  })
  it('нет поля или WAAPI — ничего не падает', () => {
    expect(() => { const b = createBands(null, layout({ url: 'x' })); b.fill('pit', { durationMs: 10 }); b.clear(); b.stop() }).not.toThrow()
    const f = fakeField(); f.bands.pit.fill.animate = undefined
    expect(() => createBands(f, layout({ url: 'x' })).fill('pit', { durationMs: 10 })).not.toThrow()
  })
  it('сцена «зеркало»: api.fill / clearFill ведут подложки поля, stop убирает их', () => {
    const f = fakeField()
    const els = Array.from({ length: 12 }, () => ({ parentElement: f, setAttribute() {}, removeAttribute() {} }))
    const free = els.map((_, i) => i).reverse()
    const pool = { take: () => free.pop(), el: k => els[k], place() {}, unplace() {}, paintFill() {}, attr() {}, flashLane() {} }
    const run = runMirrorScene({ pool, scene: { kind: 'mirror', layout: layout({ url: 'blob:x' }) } })
    run.api.fill('you', { durationMs: 2000 })
    expect(f.bands.you.anims[0].opts.duration).toBe(2000)
    run.api.clearFill(); expect(f.bands.you.anims[0].cancel).toHaveBeenCalled()
    run.stop(); expect(f.bands.you.attrs.has('data-on')).toBe(false)
  })
})

describe('подложки: разметка и стиль', () => {
  const css = read('../../../../styles/player/modules/rehearsal-bands.css')
  it('узлы лежат в поле дорожек ПЕРЕД пилюлями (под ними, без z-index); CSS подключён; подпись зелёная по центру, заливка — transform, а не width', () => {
    const pills = read('./WordLanePills.jsx')
    expect(pills.indexOf('className="wlBand"')).toBeGreaterThan(0)
    expect(pills.indexOf('className="wlBand"')).toBeLessThan(pills.indexOf('<WordLanePillEls')) // разметка пилюль вынесена в WordLanePillEls.jsx (одна на игру и стенд пилюль)
    expect(read('../../../../index.css')).toContain("@import './styles/player/modules/rehearsal-bands.css';")
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/z-index/)
    expect(css).toMatch(/\.wlBand\[data-on\]::after \{[^}]*content: attr\(data-tag\)[^}]*left: 50%[^}]*color: var\(--wl-accent\)/s)
    expect(css).toMatch(/\.wlBandFill \{[^}]*transform: scaleX\(0\)[^}]*transform-origin: 0 50%/)
    expect(css).toMatch(/border-radius: 9dvh/); expect(css).toMatch(/background: rgba\(11, 13, 17, 0\.94\)/) /* тёмная подложка: пунктир дорожек не просвечивает */
    expect(css).toMatch(/\.weak-device \.wlBand\[data-on\] \{ animation: none; \}/)
  })
  it('в старом CSS зеркала подписи на пилюлях нет', () => {
    expect(read('../../../../styles/player/modules/rehearsal-mirror.css')).not.toMatch(/\.wlPill\[data-tag\]::after/)
  })
})
