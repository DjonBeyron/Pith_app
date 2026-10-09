import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BOLT_T, ARC_T, TITLE_BOLT_K, titleFlicker, timingVars } from './sparkTiming.js'
import { tearSparks } from './ladderSparks.js'

// Страж «замыкания» надписи «Памяти пора отдыхать»: мерцание текста идёт в такт искрам на концах разорванного кабеля —
// тот же сдвиг и кратный период (CSS-переменные --p / --d из одного модуля sparkTiming.js), только opacity/transform,
// чистый CSS; последовательность: дребезг → полное гашение в чёрное (600–1200 мс) → неровное включение → покой
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '')
const title = css('../../styles/learn-sleep-title.css')
const sparksCss = css('../../styles/memory-sparks.css')
const kf = name => title.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''

describe('период и сдвиг замыкания надписи согласованы с искрами', () => {
  const sp = tearSparks(90, 36, 178)
  it('главное — сдвиг первого разряда (BOLT_T[0]) и период, кратный его периоду; редкое — дуга (ARC_T)', () => {
    expect(TITLE_BOLT_K).toBeGreaterThanOrEqual(2)
    expect(titleFlicker.bolt).toEqual(timingVars(BOLT_T[0][0] * TITLE_BOLT_K, BOLT_T[0][1]))
    const k = parseFloat(titleFlicker.bolt['--p']) / sp.bolts[0].period
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9) // периоды кратны: старты совпадают со вспышкой разряда
    expect(k).toBeGreaterThanOrEqual(2)
    expect(titleFlicker.arc).toEqual(timingVars(ARC_T[0], ARC_T[1]))
    expect(sp.bolts[0].period).toBe(BOLT_T[0][0])
    expect(sp.bolts[0].delay).toBe(BOLT_T[0][1])
    expect(sp.arc.period).toBe(ARC_T[0])
    expect(sp.arc.delay).toBe(ARC_T[1])
    expect(titleFlicker.bolt['--p']).toBe(`${sp.bolts[0].period * TITLE_BOLT_K}s`)
    expect(titleFlicker.bolt['--d']).toBe(`${sp.bolts[0].delay}s`)
    expect(titleFlicker.arc['--p']).toBe(`${sp.arc.period}s`)
    expect(titleFlicker.arc['--d']).toBe(`${sp.arc.delay}s`)
  })
  it('таблицы периодов живут в одном модуле, а не копируются', () => {
    expect(read('./ladderSparks.js')).toMatch(/from '\.\/sparkTiming\.js'/)
    expect(read('./ladderSparks.js')).not.toMatch(/const (BOLT_T|FLY_T|ARC_T)\s*=/)
    expect(read('./MemoryTearSparks.jsx')).toMatch(/from '\.\/sparkTiming\.js'/)
    const hero = read('./LearnMainAction.jsx')
    expect(hero).toMatch(/titleFlicker\.bolt/)
    expect(hero).toMatch(/titleFlicker\.arc/)
  })
  it('в CSS и у надписи, и у искр длительность и сдвиг берутся из --p / --d', () => {
    expect(title).toMatch(/\.lrMainTitle \{ animation: lrTitleBolt var\(--p[^)]*\) steps\(1, end\) var\(--d[^)]*\) infinite; \}/)
    expect(title).toMatch(/\.lrMainFlick \{ animation: lrTitleArc var\(--p[^)]*\) steps\(1, end\) var\(--d[^)]*\) infinite; \}/)
    expect(title).toMatch(/animation: lrTitleShort var\(--p[^)]*\) steps\(1, end\) var\(--d[^)]*\) infinite/)
    expect(sparksCss).toMatch(/\.memBolt \{ animation: memBoltA var\(--p[^)]*\) steps\(1, end\) var\(--d[^)]*\) infinite; \}/)
    expect(sparksCss).toMatch(/\.memArc \{ animation: memArcFlash var\(--p[^)]*\) steps\(1, end\) var\(--d[^)]*\) infinite; \}/)
  })
})

describe('мерцание — только opacity и transform, без JS, в паузах стабильно', () => {
  it('keyframes не трогают ничего, кроме opacity / transform (и timing-function)', () => {
    for (const name of ['lrTitleBolt', 'lrTitleArc', 'lrTitleShort']) {
      const body = kf(name)
      expect(body, name).not.toBe('')
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1])
      for (const p of props) expect(['opacity', 'transform', 'animation-timing-function'], `${name}: ${p}`).toContain(p)
    }
  })
  it('нет filter и анимации text-shadow / blur', () => {
    expect(title).not.toMatch(/filter|blur/)
    for (const name of ['lrTitleBolt', 'lrTitleArc', 'lrTitleShort']) expect(kf(name)).not.toMatch(/text-shadow|filter/)
    expect(title).not.toMatch(/transition/)
  })
  it('последовательность: дребезг → гашение в чёрное 600–1200 мс → неровное включение → покой ≥ 1 с', () => {
    for (const [name, period, seqMin, seqMax] of [['lrTitleBolt', BOLT_T[0][0] * TITLE_BOLT_K, 1900, 2500], ['lrTitleArc', ARC_T[0], 1000, 1400]]) {
      // кадры по порядку: [мс от старта, opacity]; steps(1, end) — значение держится до следующего кадра
      const frames = [...kf(name).matchAll(/([\d.,%\s]+)\{([^}]*)\}/g)].map(m => ({
        at: m[1].split(',').map(x => parseFloat(x) / 100 * period * 1000), op: parseFloat(m[2].match(/opacity:\s*([\d.]+)/)[1]),
      }))
      expect(frames[0].at[0], `${name}: старт в покое`).toBe(0)
      expect(frames[0].op).toBe(1)
      const end = frames.find(f => f.at.length === 2)
      expect(end.op, `${name}: конец в покое`).toBe(1)
      expect(end.at[1], `${name}: кадр до конца периода`).toBeCloseTo(period * 1000, 3)
      expect(end.at[0], `${name}: длительность последовательности`).toBeGreaterThan(seqMin)
      expect(end.at[0], `${name}: длительность последовательности`).toBeLessThan(seqMax)
      expect(period * 1000 - end.at[0], `${name}: покой между последовательностями`).toBeGreaterThanOrEqual(1000)
      expect(frames[1].at[0] / 1000, `${name}: вспышка в самом начале периода`).toBeLessThan(0.2)
      // самое длинное подряд идущее гашение (opacity ≤ .05)
      let dark = 0
      frames.forEach((f, i) => {
        if (f.op > 0.05) return
        const next = frames[i + 1]
        dark = Math.max(dark, (next ? next.at[0] : period * 1000) - f.at[0])
      })
      expect(dark, `${name}: гашение, мс`).toBeGreaterThanOrEqual(600)
      expect(dark, `${name}: гашение, мс`).toBeLessThanOrEqual(1200)
      // замедленные неровные переходы: до и после гашения интервалы 50–120 мс
      const gaps = frames.slice(1, -1).map((f, i) => frames[i + 2].at[0] - f.at[0]).filter(g => g < 400)
      for (const g of gaps) { expect(g, `${name}: интервал мерцания`).toBeGreaterThanOrEqual(50); expect(g).toBeLessThanOrEqual(120) }
      expect(new Set(gaps.map(g => Math.round(g))).size, `${name}: интервалы неравные`).toBeGreaterThan(3)
      // после гашения — минимум 2 неровных мерцания (включения/выключения), и до гашения тоже дребезг
      const idx = frames.findIndex(f => f.op <= 0.05 && frames[frames.indexOf(f) + 1]?.at[0] - f.at[0] >= 600)
      expect(frames.slice(idx + 1).filter(f => f.op > 0.05 && f.op < 1).length, `${name}: мерцание при включении`).toBeGreaterThanOrEqual(2)
      expect(frames.slice(1, idx).length, `${name}: дребезг до гашения`).toBeGreaterThanOrEqual(3)
    }
  })
  it('зелёная копия гаснет вместе с текстом: в провале она под нулевым opacity родителя, в покое её нет', () => {
    const g = kf('lrTitleShort')
    expect(g).toMatch(/0% \{ opacity: 0; \}/)
    expect(g).toMatch(/33\.8%, 100% \{ opacity: 0; \}/)
    expect(title).toMatch(/\.lrMainTitle::after \{[^}]*animation: lrTitleShort var\(--p/)
  })
  it('в скрытой вкладке и при «уменьшить движение» стоит; JS-таймеров в разметке нет', () => {
    expect(title).toMatch(/\.shellV2TabHidden \.lrMainDone \.lrMainTitle,[\s\S]*?\.lrMainFlick,[\s\S]*?::after \{ animation: none; \}/)
    expect(title).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.lrMainFlick,[\s\S]*?animation: none/)
    expect(read('./LearnMainAction.jsx')).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/)
  })
})
