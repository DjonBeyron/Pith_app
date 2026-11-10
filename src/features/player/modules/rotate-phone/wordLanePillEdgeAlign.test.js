import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createPool, POOL, fillTransform } from './wordLanePool.js'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: vi.fn(() => false) }))

// Кромка заливки и свет совпадают (edge20, владелец, «Стенд пилюль», покадрово: «в линии заполнения пилюли и света есть офсет»). Было: искры вертикальной пилюли ехали на --pill-h (клип), а слой заливки —
// на клип + 8 px (до 7 px разницы при малой заливке); свечение гонки было box-shadow слоя заливки — снаружи блока: над верхом слоя (на 10 px выше кромки), у широкой — правее веретена (на 4–16 px).
// Стало: один отступ мягкого края --wl-soft у слоя заливки и у хода / ширины слоя света, одно v для обоих (paintFill), переходов на их transform нет, свечение — слой фона по самой кромке.
const dir = '../../../../styles/player/modules/'
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
const pill = strip(read(`${dir}word-lane-pill.css`)), wide = strip(read(`${dir}word-lane-wide-fill.css`)), race = strip(read(`${dir}race-pill-fill.css`))
const block = (css, sel) => css.match(new RegExp(`(?:^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''
const SOFT = Number(pill.match(/\.wlPill \{[^}]*--wl-soft: (\d+)px;/)?.[1])
afterEach(() => { vi.restoreAllMocks() })

describe('вертикальная пилюля: искры и кромка — от одного слоя', () => {
  it('слой заливки длиннее клипа на --wl-soft, ход искр — (1 − v)·(--pill-h + --wl-soft): ровно ход слоя заливки', () => {
    expect(SOFT).toBe(8)
    expect(block(pill, '.wlPillFill')).toMatch(/inset: calc\(var\(--wl-soft\) \* -1\) 0 0;/)
    expect(block(pill, '.wlPillSparks i')).toMatch(/transform: translateY\(calc\(\(1 - var\(--fill, 0\)\) \* \(var\(--pill-h, 0px\) \+ var\(--wl-soft, 8px\)\)\)\);/)
  })
  it('модель: сплошной край заливки (верх слоя + --wl-soft) и поверхность искр (верх <i> + --ov) совпадают при любом v', () => {
    const H = 154, ov = 48, clipTop = 0
    for (const v of [0, 0.1, 0.25, 0.5, 0.75, 0.97, 1]) {
      const layerTop = clipTop - SOFT + (1 - v) * (H + SOFT)          // слой: inset −SOFT сверху, translateY((1 − v)·100 % своей высоты H + SOFT)
      const surface = clipTop - ov + (1 - v) * (H + SOFT) + ov        // <i>: рамка на --ov выше клипа, сдвиг (1 − v)·(--pill-h + --wl-soft), маска непрозрачна с --ov
      expect(Math.abs(surface - (layerTop + SOFT))).toBeLessThan(1e-9)
    }
  })
  it('светлая кромка гонки — 6…8 px слоя (нижний край — сплошной край), свечение — полоса в том же фоне с пиком на кромке, не box-shadow', () => {
    expect(race).not.toMatch(/box-shadow\s*:/)
    const base = block(race, ".wl[data-phase='student'] .wlField.wl--safe .wlPill[data-cap]:not([data-fail]) .wlPillFill")
    expect(base).toMatch(/rgba\(255, 255, 255, 0\) 6px, color-mix\(in srgb, var\(--rim\) 85%, transparent\) 7px, var\(--rim\) 8px/)
    expect(base).toMatch(/rgba\(var\(--rgb\), 0\) 0, rgba\(var\(--rgb\), calc\(0\.55 \* var\(--wl-glow, 0\)\)\) 7\.5px, rgba\(var\(--rgb\), 0\) 15px/)
    expect(base).toMatch(/transition: background-color 0\.15s linear, --wl-glow 0\.12s ease-out;/)
    expect(race).toMatch(/@property --wl-glow \{ syntax: '<number>'; inherits: false; initial-value: 0; \}/)
    expect(race).toContain(".wl[data-phase='student'] .wlPill[data-cap][data-live]:not([data-fail]):not([data-wide]) .wlPillFill { --wl-glow: 1; }")
    expect(race).toMatch(/\.weak-device \.wlPill\[data-cap\] \.wlPillFill \{ --wl-glow: 0 !important;/)
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
  it('мягкий край «в процессе» — от прозрачного до цвета за --wl-soft (50 % — под веретеном); свечения гонки у широкой нет', () => {
    const live = block(wide, ".wl[data-phase='student'] .wlField.wl--safe .wlPill[data-wide]:not([data-lock]):not([data-fail]) .wlPillFill")
    expect(live).toContain('linear-gradient(to left, rgba(var(--rgb), 0) 0, rgba(var(--rgb), 0.5) 8px, rgba(var(--rgb), 0.38) 10px)')
    expect(wide).toContain('linear-gradient(to left, rgba(var(--rgb), 0), var(--c) 8px')
    expect(race).toContain(':not([data-wide]) .wlPillFill { --wl-glow: 1; }')
  })
})

describe('движение: одно v, без расходящихся переходов', () => {
  function rig() {
    vi.spyOn(performance, 'now').mockImplementation(() => 5000)
    const el = (parts = {}, extra = {}) => { const attrs = new Map(); return { style: { setProperty(k, v) { this[k] = v } }, dataset: {}, setAttribute: (k, v) => attrs.set(k, v), removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, animate: () => ({ currentTime: 0, cancel() {} }), querySelector: s => parts[s] ?? null, querySelectorAll: () => [], ...extra } }
    const pills = Array.from({ length: POOL }, () => el({ '.wlPillFill': el(), '.wlPillClip': el({}, { offsetHeight: 154 }), '.wlPillSparks i': el(), '.wlGhost': el(), '.wlPace': el() }))
    return { pool: createPool({ querySelectorAll: s => (s === '[data-pill]' ? pills : []), classList: { contains: () => false } }), pills }
  }
  it('paintFill пишет заливке и слою света одно и то же v в одном вызове (широкая — translateX в % одной ширины)', () => {
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
    expect(sv.style['--fill']).toBe('0.400'); expect(pills[kv].querySelector('.wlPillFill').style.transform).toBe(fillTransform(0.4))
  })
  it('ни один CSS-файл пилюль не ставит переход на transform / translate / inset слоя заливки и слоя света', () => {
    const files = readdirSync(fileURLToPath(new URL(dir, import.meta.url))).filter(f => /^(word-lane|race-pill|race-phrase)/.test(f) && f.endsWith('.css'))
    const bad = []
    for (const f of files) {
      for (const m of strip(read(`${dir}${f}`)).matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const sels = m[1].split(',').map(s => s.trim()).filter(s => /\.wlPillFill$|\.wlPillSparks i$|\.wlPillSparks$/.test(s))
        const tr = m[2].match(/transition:\s*([^;]+)/)?.[1] ?? ''
        if (sels.length && /\b(all|transform|translate|inset|left|right|top|bottom)\b/.test(tr)) bad.push(`${f}: ${sels.join(', ')} → ${tr}`)
      }
    }
    expect(bad).toEqual([])
    expect(block(wide, '.wlField .wlPill[data-wide] .wlPillSparks')).toMatch(/transition: none;/)
  })
})
