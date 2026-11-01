import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Уход центральных плашек (v3.3.85): плашка улетает вверх по той же кривой, что взлёт пилюли (riseFrames), остаётся в DOM на время ухода (useWordLaneLeavingPlates), в lite — простое затухание.
const h = vi.hoisted(() => ({ states: [], i: 0, effects: [], refs: [], r: 0, weak: false }))
vi.mock('react', async orig => ({
  ...(await orig()),
  useState: init => { const k = h.i++; if (!(k in h.states)) h.states[k] = typeof init === 'function' ? init() : init; return [h.states[k], v => { h.states[k] = typeof v === 'function' ? v(h.states[k]) : v }] },
  useRef: init => { const k = h.r++; if (!(k in h.refs)) h.refs[k] = { current: init }; return h.refs[k] },
  useEffect: fn => { h.effects.push(fn) },
}))
vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => h.weak }))

const { riseFrames, RISE_MS, RISE_EASING, RISE_END_Y, RISE_SCALE } = await import('./wordLaneRise.js')
const { plateExitFrames, startPlateExit, plateExitMs, plateLite, PLATE_EXIT_MS, PLATE_EXIT_LITE_MS } = await import('./wordLanePlateExit.js')
const { useWordLaneLeavingPlates } = await import('./useWordLaneLeavingPlates.js')

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const lines = rel => read(rel).split('\n').length
beforeEach(() => { h.states.length = 0; h.i = 0; h.effects.length = 0; h.refs.length = 0; h.r = 0; h.weak = false })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('кадры ухода: та же кривая, что у взлёта пилюли', () => {
  it('те же offset, rotate, scale, opacity, что у riseFrames; отличается только формат translate (сдвиг от места плашки)', () => {
    const plate = plateExitFrames(50, 812)
    const pill = riseFrames(50, 812)
    expect(plate).toHaveLength(pill.length)
    plate.forEach((f, k) => {
      expect(f.offset).toBe(pill[k].offset)
      expect(f.rotate).toBe(pill[k].rotate)
      expect(f.scale).toBe(pill[k].scale)
      expect(f.opacity).toBe(pill[k].opacity)
    })
  })
  it('старт — на месте (0px 0px), конец — выше на путь до RISE_END_Y и сжат до искры; синусоида по x', () => {
    const f = plateExitFrames(50, 812)
    expect(f[0].translate).toBe('0.00px 0.00px')
    expect(f[0].scale).toBeUndefined()                                        // старт «из-под анимации», как у пилюли
    const last = f[f.length - 1]
    expect(last.translate.split(' ')[1]).toBe((((RISE_END_Y - 50) / 100) * 812).toFixed(2) + 'px')
    expect(last.scale).toBe(RISE_SCALE)
    expect(last.opacity).toBe(0)
    expect(f.some(x => Number(x.translate.split('px')[0]) !== 0)).toBe(true)   // x ходит по волне
    expect(f.some(x => x.rotate !== f[0].rotate)).toBe(true)                  // наклон по касательной
  })
  it('riseFrames без третьего параметра не изменился: translate пилюли — wavePosition', () => {
    expect(riseFrames(50, 812)[0].translate).toBe('calc(-50% + 0.00px) calc(50.000dvh - 50%)')
  })
  it('startPlateExit: RISE_MS и тот же easing, fill both; высота старта — по центру плашки на экране; без WAAPI — null', () => {
    const el = { getBoundingClientRect: () => ({ top: 300, height: 100 }), animate: vi.fn(() => ({})) }
    startPlateExit(el)
    const [frames, opts] = el.animate.mock.calls[0]
    expect(opts).toEqual({ duration: RISE_MS, easing: RISE_EASING, fill: 'both' })
    expect(frames).toEqual(plateExitFrames((350 / 812) * 100, 812))
    expect(startPlateExit({ getBoundingClientRect: () => ({}) })).toBeNull()
    expect(startPlateExit(null)).toBeNull()
  })
  it('длительность: как у взлёта; lite — 0,25 с (то же число в CSS); lite = слабое устройство', () => {
    expect(PLATE_EXIT_MS).toBe(RISE_MS)
    expect(plateExitMs(false)).toBe(RISE_MS)
    expect(plateExitMs(true)).toBe(PLATE_EXIT_LITE_MS)
    expect(read('../../../../styles/player/modules/word-lane-plate.css')).toContain(`wlTurnFadeOut ${PLATE_EXIT_LITE_MS / 1000}s`)
    expect(plateLite()).toBe(false)
    h.weak = true
    expect(plateLite()).toBe(true)
  })
})

describe('useWordLaneLeavingPlates: плашка остаётся в DOM на время ухода', () => {
  const render = (text, idx) => { h.i = 0; h.r = 0; h.effects.length = 0; const out = useWordLaneLeavingPlates(text, idx); h.effects.forEach(fn => fn()); return out }

  it('текущая плашка — одна, leaving = false, id растёт с каждым появлением', () => {
    expect(render('', 0)).toEqual([])
    const a = render('Теперь твоя очередь', 3)
    expect(a).toEqual([{ text: 'Теперь твоя очередь', idx: 3, id: 1, leaving: false }])
    expect(render('Теперь твоя очередь', 3)).toEqual(a)                      // без изменений — тот же id (узор и звук не повторяются)
  })
  it('директор снял плашку — она остаётся с leaving = true на время ухода (RISE_MS + запас) и затем пропадает', () => {
    vi.useFakeTimers()
    render('Раунд 1', 2)
    const gone = render('', 3)
    expect(gone).toEqual([{ text: 'Раунд 1', idx: 2, id: 1, leaving: true }])
    vi.advanceTimersByTime(RISE_MS - 1)
    expect(render('', 3)).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(render('', 3)).toEqual([])
  })
  it('в lite уходит за 0,25 с', () => {
    vi.useFakeTimers()
    h.weak = true
    render('Дубль', 5)
    render('', 6)
    vi.advanceTimersByTime(PLATE_EXIT_LITE_MS + 100)
    expect(render('', 6)).toEqual([])
  })
  it('следующая плашка приходит, пока прежняя улетает: на экране обе, у прежней leaving, у новой новый id', () => {
    render('Раунд 1', 2)
    const both = render('Теперь твоя очередь', 3)
    expect(both.map(p => [p.id, p.leaving])).toEqual([[1, true], [2, false]])
  })
})

describe('размеры файлов и подключение', () => {
  it('файлы ≤ 250 строк, плашку монтирует игра через хук', () => {
    for (const f of ['./wordLanePlateExit.js', './useWordLaneLeavingPlates.js', './WordLaneTurnPlate.jsx', './wordLanePlateExit.test.js']) expect(lines(f)).toBeLessThanOrEqual(250)
    expect(read('./WordLaneGame.jsx')).toContain("from './useWordLaneLeavingPlates.js'")
  })
  it('три кольца над дорожками (.wlDots) скрыты стилем: display: none (v3.3.85)', () => {
    const css = read('../../../../styles/player/modules/word-lane.css')
    expect(css).toMatch(/\.wlDots \{ display: none;/)
  })
})
