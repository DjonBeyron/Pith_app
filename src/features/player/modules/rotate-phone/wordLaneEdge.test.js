import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { edgeScale, edgeFrames, startFlight, EDGE_SCALE, EDGE_ZONE, edgeScaleAt, FLIGHT_MS, ANIM_MS } from './wordLaneMotion.js'
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { missPill, snapPill, POP_EDGE_FRAMES, SOFT_MISS_MS } from './wordLaneSnap.js'

// «Гонка с Питом»: масштаб летящих вниз пилюль (точка расширения edge, по умолчанию выкл) и тихий промах (quiet): микро-анимация без полос.
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')
const el = (attrs = []) => ({ animate: vi.fn(() => ({ currentTime: 0 })), setAttribute: vi.fn(), hasAttribute: n => attrs.includes(n), querySelector: () => null })

describe('масштаб пилюль у краёв (edge)', () => {
  it('рост до 1 за первые 15 % пути, убывание на последних 15 %, посередине ровно 1', () => {
    expect(edgeScale(ENTER_Y)).toBeCloseTo(EDGE_SCALE, 3); expect(edgeScale(EXIT_Y)).toBeCloseTo(EDGE_SCALE, 3)
    expect(EDGE_SCALE).toBe(0.85); expect(EDGE_ZONE).toBe(0.15)
    expect(edgeScaleAt(EDGE_ZONE)).toBe(1); expect(edgeScaleAt(1 - EDGE_ZONE)).toBe(1)
    for (const u of [0.15, 0.2, 0.3, 0.5, 0.7, 0.85]) expect(edgeScaleAt(u)).toBe(1)
    const grow = [0, 0.03, 0.06, 0.09, 0.12, 0.15].map(edgeScaleAt)
    for (let i = 1; i < grow.length; i++) expect(grow[i]).toBeGreaterThan(grow[i - 1])
    expect(edgeScaleAt(0.075)).toBeCloseTo(0.925, 3)
    const shrink = [0.85, 0.88, 0.91, 0.94, 0.97, 1].map(edgeScaleAt)
    for (let i = 1; i < shrink.length; i++) expect(shrink[i]).toBeLessThan(shrink[i - 1])
    expect(edgeScaleAt(0.5 - 1e-9)).toBe(1)
  })
  it('кадры полёта: положение как у прямого полёта, scale на каждом кадре, 1 между зонами 15 %/85 %; offset не больше доли полёта', () => {
    const f = edgeFrames()
    expect(f.every(k => k.translate && k.scale)).toBe(true)
    expect(f[0].scale).toBeCloseTo(EDGE_SCALE, 3); expect(Math.max(...f.map(k => k.scale))).toBe(1)
    const offs = f.filter(k => k.offset != null).map(k => k.offset)
    expect(Math.max(...offs)).toBeCloseTo(FLIGHT_MS / ANIM_MS, 6); expect(offs).toEqual([...offs].sort((a, b) => a - b))
  })
  it('по умолчанию выключено: startFlight без edge пишет прежние три кадра без scale', () => {
    const a = el(); startFlight(a, 0, 1)
    expect(a.animate.mock.calls[0][0]).toHaveLength(3); expect(a.animate.mock.calls[0][0].some(k => k.scale != null)).toBe(false)
    const b = el(); startFlight(b, 0, 1, true)
    expect(b.animate.mock.calls[0][0].every(k => k.scale != null)).toBe(true)
  })
  it('пул: take принимает edge и quiet; на слабом устройстве масштаба нет; признаки снимаются при возврате', () => {
    const src = read('./wordLanePool.js')
    expect(src).toContain('edge = false, quiet = false'); expect(src).toContain('const scaled = edge && !isWeakDevice()'); expect(src).toContain("'data-quiet', 'data-edge'")
    expect(read('./wordLaneOrderScene.js')).toContain('edge: e.prompt.edge')
    expect(read('./useWordLanePills.js')).toContain('edge: step.edge, quiet: step.quiet')
  })
  it('хлопок принятой пилюли с масштабом полёта берёт 1 из-под анимации (без кадров 1 в начале и конце)', () => {
    const a = el(['data-edge']); snapPill(a, 0, { full: false })
    expect(a.animate.mock.calls[0][0]).toBe(POP_EDGE_FRAMES)
    const b = el(); snapPill(b, 0, { full: false }); expect(b.animate.mock.calls[0][0]).not.toBe(POP_EDGE_FRAMES)
  })
})

describe('тихий промах (data-quiet)', () => {
  it('неверное слово: дрожь и красная обводка 200 мс на самой пилюле, без data-wrong (полос) и без вспышки внутри', () => {
    const p = el(['data-quiet']); missPill(p)
    expect(p.setAttribute).not.toHaveBeenCalled(); expect(p.animate).toHaveBeenCalledTimes(2)
    for (const c of p.animate.mock.calls) expect(c[1].duration).toBe(SOFT_MISS_MS)
    expect(SOFT_MISS_MS).toBe(200)
    expect(JSON.stringify(p.animate.mock.calls.map(c => c[0]))).not.toMatch(/filter/)
  })
  it('обычная пилюля (другие раунды, репетиция): data-wrong и красная вспышка — как было', () => {
    const p = el(); missPill(p)
    expect(p.setAttribute).toHaveBeenCalledWith('data-wrong', '1')
  })
  it('в «Разгоне» нет data-fail / reveal / linger / тени: при quiet движок их не ставит; CSS прячет полосы у data-quiet', () => {
    const src = read('./useWordLanePills.js')
    expect(src).toContain('if (!step.quiet) e.pills.forEach'); expect(src).toContain('e.rep && !step.quiet')
    const css = read('../../../../styles/player/modules/race-pill-fill.css')
    expect(css).toContain('.wlPill[data-quiet] .wlPillClip::after { display: none; }')
    expect(css).not.toMatch(/\bfilter:/)
  })
  it('граней заливки больше нет (v3.3.185: жидкость — чистый цвет дорожки, свет — у линии уровня, word-lane-pill.css): в файле гонки — только тихий промах; без filter и box-shadow', () => {
    const css = read('../../../../styles/player/modules/race-pill-fill.css')
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/--wl-glow|--rim|wlPillFill|data-live/)
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/box-shadow\s*:/) // свечение — слой фона по кромке, не тень снаружи слоя (edge20, wordLanePillEdgeAlign.test.js)
    expect(css).not.toMatch(/\bfilter:/); expect(css).not.toContain('repeating-linear-gradient')
  })
})
