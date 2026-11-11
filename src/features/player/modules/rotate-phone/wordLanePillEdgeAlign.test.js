import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPool, POOL, fillTransform } from './wordLanePool.js'
import { surfaceAt, inkTransform, levelTransform, SOFT_PX, SURF_PX } from './wordLaneLevel.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Край жидкости, линия уровня и свет совпадают (edge20, владелец, «Стенд пилюль», покадрово: «в линии заполнения пилюли и света есть офсет»). Было: искры вертикальной пилюли ехали на --pill-h (клип), а слой
// заливки — на клип + 8 px; свечение гонки было box-shadow слоя заливки — снаружи блока. v3.3.186: линия уровня вернулась (с кончиками за стенками), и офсета нет ПО ПОСТРОЕНИЮ — слой уровня <i> вертикальной
// пилюли занимает тот же блок, что слой заливки, и получает тот же transform в том же вызове paintFill; поверхность жидкости, центр линии и граница тёмной подписи — на одном отступе --wl-surf (wordLaneLevel.js).
const dir = '../../../../styles/player/modules/'
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const pill = strip(read(`${dir}word-lane-pill.css`)), wide = strip(read(`${dir}word-lane-wide-fill.css`)), race = strip(read(`${dir}race-pill-fill.css`)), ink = strip(read(`${dir}word-lane-pill-ink.css`))
const block = (css, sel) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''
const SOFT = Number(pill.match(/\.wlPill \{[^}]*--wl-soft: (\d+)px;/)?.[1])
afterEach(() => { vi.restoreAllMocks() })

describe('вертикальная пилюля: жидкость, линия и тёмная подпись — от одного слоя', () => {
  it('слой заливки длиннее клипа на --wl-soft; слой уровня — тот же блок; поверхность — на --wl-surf (середина запаса) у края цвета, у линии и у окна тёмной подписи', () => {
    expect(SOFT).toBe(8); expect(SOFT_PX).toBe(8); expect(SURF_PX).toBe(4)
    expect(block(pill, '.wlPillFill')).toMatch(/inset: calc\(var\(--wl-soft\) \* -1\) 0 0;/)
    expect(block(pill, '.wlPillSparks i')).toMatch(/inset: calc\(var\(--wl-soft\) \* -1\) 0 0;/)
    expect(block(pill, '.wlPillFill')).toMatch(/linear-gradient\(to bottom, rgba\(var\(--rgb\), 0\) calc\(var\(--wl-surf\) - 0\.5px\), var\(--c\) calc\(var\(--wl-surf\) \+ 0\.5px\)\)/) // край цвета — 1 px вокруг --wl-surf
    expect(block(pill, '.wlPillSparks b')).toMatch(/top: calc\(var\(--wl-surf\) - 1\.5px\); height: 3px;/)                                                                       // центр линии — там же
    expect(block(ink, '.wlPillInk')).toMatch(/inset: var\(--wl-surf\) 0 0;/)                                                                                                      // окно тёмной подписи — от поверхности
    expect(block(ink, '.wlPillInkIn')).toMatch(/inset: calc\(var\(--wl-surf\) \* -1\) 0 0;/)                                                                                     // содержимое — блок слоя заливки
  })
  it('модель: край цвета (верх слоя + --wl-surf) = поверхность из wordLaneLevel.surfaceAt при любом v; при 100 % она на --wl-surf ВЫШЕ клипа (запас)', () => {
    const H = 154, geo = { w: 78, h: H }
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.97, 1]) {
      const layerTop = -SOFT + (1 - v) * (H + SOFT)                    // слой: inset −SOFT сверху, translateY((1 − v)·100 % своей высоты H + SOFT)
      expect(Math.abs((H - surfaceAt(v, geo)) - (layerTop + SURF_PX))).toBeLessThan(1e-9)
    }
    expect(H - surfaceAt(1, geo)).toBe(-SURF_PX)
  })
  it('граней и свечения в фоне заливки больше нет (v3.3.186: жидкость — чистый цвет, свет — у линии уровня); box-shadow и переходов на заливке нет', () => {
    expect(race).not.toMatch(/box-shadow\s*:/)
    expect(race).not.toMatch(/--wl-glow|--rim|wlPillFill/)
    expect(race).toContain('.wlPill[data-quiet] .wlPillClip::after { display: none; }')
    expect(pill).not.toMatch(/\.wlPillFill \{[^}]*transition/)
  })
})

describe('широкая пилюля «Фраз»: веретено на середине мягкого края', () => {
  it('слой заливки шире клипа на --wl-soft справа, слой кромки — на --wl-soft / 2 с каждой стороны: ширина одна', () => {
    expect(wide).toContain('.wlPill[data-wide] .wlPillFill { inset: 0 calc(var(--wl-soft) * -1) 0 0;')
    expect(wide).toContain('left: calc(var(--gap) - var(--wl-soft) / 2); right: calc(var(--gap) - var(--wl-soft) / 2);')
    expect(wide).toMatch(/\.wlPill\[data-wide\] \.wlPillSparks i::before \{[^}]*left: -1\.25px;[^}]*width: 2\.5px;/) // центр веретена — левый край <i>
  })
  it('модель: центр веретена = правый край слоя заливки − --wl-soft / 2 при любом v', () => {
    const W = 290, clipL = 0
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.97, 1]) {
      const fillRight = clipL + (W + SOFT) - (1 - v) * (W + SOFT)      // translateX(−(1 − v)·100 %) слоя шириной W + SOFT
      const spindle = clipL - SOFT / 2 + v * (W + SOFT)                // слой кромки от clipL − SOFT/2 той же ширины, translateX(v·100 %)
      expect(Math.abs(spindle - (fillRight - SOFT / 2))).toBeLessThan(1e-9)
    }
  })
  it('край цвета — 1 px под веретеном (--wl-surf от правого края слоя), один фон «в процессе» и «принято»; при 100 % поверхность на --wl-surf за торцом клипа', () => {
    expect(wide).toContain('.wlPill[data-wide]:not([data-fail]) .wlPillFill { background: linear-gradient(to left, rgba(var(--rgb), 0) calc(var(--wl-surf) - 0.5px), var(--c) calc(var(--wl-surf) + 0.5px)); }')
    expect(wide).not.toMatch(/data-phase='student'[^{]*\.wlPillFill/)
    expect(surfaceAt(1, { w: 290, h: 86, wide: true })).toBe(290 + SURF_PX)
    expect(block(ink, ".wlPill[data-wide] .wlPillInk")).toMatch(/inset: 0 var\(--wl-surf\) 0 0;/) // окно тёмной подписи — до поверхности
  })
})

describe('движение: одно v, без расходящихся переходов', () => {
  function rig() {
    vi.spyOn(performance, 'now').mockImplementation(() => 5000)
    const el = (parts = {}, extra = {}) => { const attrs = new Map(); return { style: { setProperty(k, v) { this[k] = v } }, dataset: {}, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, animate: () => ({ currentTime: 0, cancel() {} }), querySelector: s => parts[s] ?? null, querySelectorAll: () => [], ...extra } }
    const pills = Array.from({ length: POOL }, () => el({ '.wlPillFill': el(), '.wlPillClip': el({}, { offsetHeight: 154, offsetWidth: 78 }), '.wlPillSparks i': el(), '.wlPillSparks b': el(), '.wlPillInkIn': el(), '.wlGhost': el(), '.wlPace': el() }))
    return { pool: createPool({ querySelectorAll: s => (s === '[data-pill]' ? pills : []), classList: { contains: () => false } }), pills }
  }
  it('paintFill пишет заливке, слою уровня и тёмной подписи одно и то же v в одном вызове (вертикальная — один и тот же transform; широкая — translateX в % одной ширины)', () => {
    const { pool, pills } = rig()
    const k = pool.take(0, { flight: false, wide: true })
    const fill = pills[k].querySelector('.wlPillFill'), sp = pills[k].querySelector('.wlPillSparks i')
    for (const v of [0.1, 0.25, 0.5, 0.75, 0.97]) {
      pool.paintFill(k, v)
      const f = -Number(fill.style.transform.match(/translateX\((-?[\d.]+)%\)/)[1]), s = Number(sp.style.transform.match(/translateX\(([\d.]+)%\)/)[1])
      expect(Math.abs((100 - f) - s)).toBeLessThanOrEqual(0.1)          // правый край заливки и левый край слоя кромки — в долях одной ширины, расхождение ≤ округления (0,1 % ≈ 0,3 px)
      expect(fill.style.transform).toBe(fillTransform(v, true))
    }
    const kv = pool.take(1, { flight: false })
    const sv = pills[kv].querySelector('.wlPillSparks i')
    pool.paintFill(kv, 0.4)
    for (const v of [0.03, 0.4, 0.77, 1]) {
      pool.paintFill(kv, v)
      expect(pills[kv].querySelector('.wlPillFill').style.transform).toBe(fillTransform(v))
      expect(sv.style.transform).toBe(fillTransform(v))                 // слой уровня — тот же блок и тот же сдвиг: линия на краю жидкости покадрово
      expect(sv.style.transform).toBe(levelTransform(v))
      expect(pills[kv].querySelector('.wlPillInkIn').style.transform).toBe(inkTransform(v)) // встречный сдвиг: тот же процент с обратным знаком
      expect(Number(/\((-?[\d.]+)%/.exec(inkTransform(v))[1])).toBeCloseTo(-Number(/\((-?[\d.]+)%/.exec(fillTransform(v))[1]), 9)
    }
    expect(pills[k].querySelector('.wlPillInkIn').style.transform).toBe(inkTransform(0.97, true))
  })
  it('ни один CSS-файл пилюль не ставит переход на transform / translate / inset слоя заливки и слоя света', () => {
    const files = readdirSync(fileURLToPath(new URL(dir, import.meta.url))).filter(f => /^(word-lane|race-pill|race-phrase)/.test(f) && f.endsWith('.css'))
    const bad = []
    for (const f of files) {
      for (const m of strip(read(`${dir}${f}`)).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const sels = m[1].split(',').map(s => s.trim()).filter(s => /\.wlPillFill$|\.wlPillSparks i$|\.wlPillSparks b$|\.wlPillSparks$|\.wlPillInk$|\.wlPillInkIn$|\.wlBubs$/.test(s))
        const tr = m[2].match(/transition:\s*([^;]+)/)?.[1] ?? ''
        if (sels.length && /\b(all|transform|translate|inset|left|right|top|bottom)\b/.test(tr)) bad.push(`${f}: ${sels.join(', ')} → ${tr}`)
      }
    }
    expect(bad).toEqual([])
    expect(block(wide, '.wlField .wlPill[data-wide] .wlPillSparks')).toMatch(/transition: none;/)
  })
})
