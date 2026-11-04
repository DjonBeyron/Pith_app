import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { edgeScale, edgeFrames, startFlight, EDGE_SCALE, EDGE_MID_Y, FLIGHT_MS, ANIM_MS } from './wordLaneMotion.js'
import { ENTER_Y, EXIT_Y } from './wordLaneTimeline.js'
import { missPill, snapPill, POP_EDGE_FRAMES, SOFT_MISS_MS } from './wordLaneSnap.js'

// «Гонка с Питом»: масштаб летящих вниз пилюль (точка расширения edge, по умолчанию выкл) и тихий промах (quiet): микро-анимация без полос.
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')
const el = (attrs = []) => ({ animate: vi.fn(() => ({ currentTime: 0 })), setAttribute: vi.fn(), hasAttribute: n => attrs.includes(n), querySelector: () => null })

describe('масштаб пилюль у краёв (edge)', () => {
  it('у входа и ухода 0,85, на 50 % высоты обычный размер, между — плавно, по положению', () => {
    expect(edgeScale(ENTER_Y)).toBeCloseTo(EDGE_SCALE, 3); expect(edgeScale(EXIT_Y)).toBeCloseTo(EDGE_SCALE, 3)
    expect(edgeScale(EDGE_MID_Y)).toBe(1); expect(EDGE_MID_Y).toBe(50); expect(EDGE_SCALE).toBe(0.85)
    const ys = [-14, 0, 20, 35, 50, 65, 80, 100, 118]
    const sc = ys.map(edgeScale)
    for (let i = 1; i < sc.length; i++) expect(Math.abs(sc[i] - sc[i - 1])).toBeLessThan(0.1)
    expect(sc.every(v => v >= EDGE_SCALE && v <= 1)).toBe(true)
  })
  it('кадры полёта: положение как у прямого полёта, scale на каждом кадре, пик 1 в середине пути; offset не больше доли полёта', () => {
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
  it('грани заливки: светлая кромка и блик при приросте (data-live), без filter, без отдельной горизонтальной линии', () => {
    const css = read('../../../../styles/player/modules/race-pill-fill.css')
    expect(css).toContain('[data-cap]'); expect(css).toContain('[data-live]'); expect(css).toContain('box-shadow'); expect(css).toContain('--rim')
    expect(css).not.toMatch(/\bfilter:/); expect(css).not.toContain('repeating-linear-gradient')
  })
})
