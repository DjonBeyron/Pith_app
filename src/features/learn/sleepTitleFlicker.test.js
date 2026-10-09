import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BOLT_T, ARC_T, TITLE_BOLT_K, titleFlicker, timingVars } from './sparkTiming.js'
import { tearSparks } from './ladderSparks.js'

// Страж «замыкания» надписи «Памяти пора отдыхать»: мерцание текста идёт в такт искрам на концах разорванного кабеля —
// тот же сдвиг и кратный период (CSS-переменные --p / --d из одного модуля sparkTiming.js), только opacity/transform,
// чистый CSS; последовательность: дребезг → ПЛАВНОЕ затухание в тёмно-слабый (не в ноль, 500–900 мс) → выдержка → неровное включение → покой
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
  it('последовательность: дребезг → плавное затухание 500–900 мс в тёмно-слабый (не в ноль) → выдержка → неровное включение → покой ≥ 3 с', () => {
    for (const [name, period, seqMin, seqMax] of [['lrTitleBolt', BOLT_T[0][0] * TITLE_BOLT_K, 2200, 2900], ['lrTitleArc', ARC_T[0], 1400, 2000]]) {
      // кадры по порядку: [мс от старта, opacity, функция времени до следующего кадра]
      const frames = [...kf(name).matchAll(/([\d.,%\s]+)\{([^}]*)\}/g)].map(m => ({
        at: m[1].split(',').map(x => parseFloat(x) / 100 * period * 1000), op: parseFloat(m[2].match(/opacity:\s*([\d.]+)/)[1]),
        ease: /animation-timing-function:\s*ease-in-out/.test(m[2]),
      }))
      expect(frames[0].at[0], `${name}: старт в покое`).toBe(0)
      expect(frames[0].op).toBe(1)
      const end = frames.find(f => f.at.length === 2)
      expect(end.op, `${name}: конец в покое`).toBe(1)
      expect(end.at[1], `${name}: кадр до конца периода`).toBeCloseTo(period * 1000, 3)
      expect(end.at[0], `${name}: длительность последовательности`).toBeGreaterThan(seqMin)
      expect(end.at[0], `${name}: длительность последовательности`).toBeLessThan(seqMax)
      expect(period * 1000 - end.at[0], `${name}: покой между последовательностями`).toBeGreaterThanOrEqual(3000)
      expect(frames[1].at[0] / 1000, `${name}: вспышка в самом начале периода`).toBeLessThan(0.2)
      // надпись не пропадает: нигде ноль, минимум — «погасшая лампа» 0.1–0.2
      const min = Math.min(...frames.map(f => f.op))
      expect(min, `${name}: минимум opacity`).toBeGreaterThanOrEqual(0.1)
      expect(min, `${name}: минимум opacity`).toBeLessThanOrEqual(0.2)
      // плавное затухание: единственный ключевой кадр с ease-in-out, 1 → минимум за 500–900 мс
      const fi = frames.findIndex(f => f.ease)
      expect(frames.filter(f => f.ease).length, `${name}: одно плавное затухание`).toBe(1)
      expect(frames[fi].op, `${name}: затухание начинается с белого`).toBe(1)
      const dark = frames[fi + 1]
      expect(dark.op, `${name}: затухание до минимума`).toBe(min)
      const fade = dark.at[0] - frames[fi].at[0]
      expect(fade, `${name}: плавное затухание, мс`).toBeGreaterThanOrEqual(500)
      expect(fade, `${name}: плавное затухание, мс`).toBeLessThanOrEqual(900)
      // выдержка тёмным 600–900 мс (до следующего кадра)
      const hold = frames[fi + 2].at[0] - dark.at[0]
      expect(hold, `${name}: выдержка тёмным, мс`).toBeGreaterThanOrEqual(600)
      expect(hold, `${name}: выдержка тёмным, мс`).toBeLessThanOrEqual(900)
      // замедленные неровные переходы (steps) до и после затухания: интервалы 50–120 мс
      const gaps = frames.slice(1, -1).map((f, i) => frames[i + 2].at[0] - f.at[0]).filter(g => g < 400)
      for (const g of gaps) { expect(g, `${name}: интервал мерцания`).toBeGreaterThanOrEqual(50); expect(g).toBeLessThanOrEqual(120) }
      expect(new Set(gaps.map(g => Math.round(g))).size, `${name}: интервалы неравные`).toBeGreaterThan(3)
      // до затухания — дребезг (≥ 3 перехода), после выдержки — минимум 3 неровных мерцания, затем белый
      expect(frames.slice(1, fi).length, `${name}: дребезг до затухания`).toBeGreaterThanOrEqual(3)
      expect(frames.slice(fi + 2, -1).filter(f => f.op > min && f.op < 1).length, `${name}: мерцание при включении`).toBeGreaterThanOrEqual(3)
    }
  })
  it('главная и дуга кратны периоду разряда, ключи и затухание синхронны с зелёной копией', () => {
    const k = parseFloat(titleFlicker.bolt['--p']) / BOLT_T[0][0]
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9)
    const fade = /(\d+\.?\d*)%\s*\{[^}]*ease-in-out/
    expect(kf('lrTitleBolt').match(fade)[1]).toBe(kf('lrTitleShort').match(fade)[1]) // зелёная уходит вместе с текстом
  })
  it('зелёная копия гаснет вместе с текстом: в тёмной выдержке её нет, в покое её нет', () => {
    const g = kf('lrTitleShort')
    expect(g).toMatch(/0% \{ opacity: 0; \}/)
    expect(g).toMatch(/41\.5%, 100% \{ opacity: 0; \}/)
    expect(g).toMatch(/18\.57% \{ opacity: 0; \}/) // к концу затухания текста зелёная копия уже погашена
    expect(title).toMatch(/\.lrMainTitle::after \{[^}]*animation: lrTitleShort var\(--p/)
  })
  it('в скрытой вкладке и при «уменьшить движение» стоит; JS-таймеров в разметке нет', () => {
    expect(title).toMatch(/\.shellV2TabHidden \.lrMainDone \.lrMainTitle,[\s\S]*?\.lrMainFlick,[\s\S]*?::after \{ animation: none; \}/)
    expect(title).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.lrMainFlick,[\s\S]*?animation: none/)
    expect(read('./LearnMainAction.jsx')).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/)
  })
})
