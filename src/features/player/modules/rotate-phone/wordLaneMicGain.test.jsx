import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createWordListener } from './wordLaneListen.js'
import WordLaneHud from './WordLaneHud.jsx'
import { MIC_GAIN_KEY } from '../../../../shared/lib/gameMicGain.js'

// Чувствительность микрофона в игре: слушатель отдаёт движку усиление из настройки; HUD ⚙ показывает три уровня
const memStore = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
let store
beforeEach(() => { store = memStore(); vi.stubGlobal('localStorage', store) })
afterEach(() => vi.unstubAllGlobals())

describe('слушатель игры и усиление', () => {
  const run = micGain => {
    const calls = []
    const listen = async (model, grammar, cb, opts) => { calls.push(opts); return { stop() {}, cancel() {} } }
    const l = createWordListener({ word: 'try', onChange() {}, runtime: { getModel: () => ({}) }, listen, micGain })
    l.start()
    return new Promise(r => setTimeout(() => { l.dispose(); r(calls) }, 0))
  }
  it('в движок уходит gain из настройки (по умолчанию ×2, «обычная» — ×1, «очень высокая» — ×4)', async () => {
    expect((await run(undefined))[0].gain).toBe(2)
    store.setItem(MIC_GAIN_KEY, 'normal'); expect((await run(undefined))[0].gain).toBe(1)
    store.setItem(MIC_GAIN_KEY, 'max'); expect((await run(undefined))[0].gain).toBe(4)
  })
  it('gain можно подставить (тесты, другие модули)', async () => { expect((await run(() => 3))[0].gain).toBe(3) })
})

describe('HUD ⚙: «Чувствительность микрофона»', () => {
  const html = () => renderToStaticMarkup(createElement(WordLaneHud, { dbg: { recorder: null }, rootRef: { current: null }, defaultOpen: true }))
  it('три кнопки: Обычная / Высокая ×2 / Очень высокая ×4; по умолчанию выбрана «Высокая»', () => {
    const out = html()
    expect(out).toContain('data-testid="wl-hud-gain"'); expect(out).toContain('Чувствительность микрофона'); expect(out).toContain('со следующей ступени')
    for (const id of ['normal', 'high', 'max']) expect(out).toContain(`data-testid="wl-hud-gain-${id}"`)
    expect(out).toMatch(/wlHudChip wlHudChip--on"[^>]*aria-pressed="true"[^>]*data-testid="wl-hud-gain-high"/)
    expect(out).toContain('Обычная'); expect(out).toContain('Высокая ×2'); expect(out).toContain('Очень высокая ×4')
  })
  it('выбранный уровень подсвечен', () => {
    store.setItem(MIC_GAIN_KEY, 'max')
    expect(html()).toMatch(/wlHudChip wlHudChip--on"[^>]*aria-pressed="true"[^>]*data-testid="wl-hud-gain-max"/)
  })
})
