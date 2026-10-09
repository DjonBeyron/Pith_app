import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BOLT_T, ARC_T, titleFlicker, timingVars } from './sparkTiming.js'
import { tearSparks } from './ladderSparks.js'

// Страж «замыкания» надписи «Памяти пора отдыхать»: мерцание текста идёт в такт искрам на концах разорванного кабеля —
// те же период и сдвиг (CSS-переменные --p / --d из одного модуля sparkTiming.js), только opacity/transform, чистый CSS
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const css = rel => read(rel).replace(/\/\*[\s\S]*?\*\//g, '')
const title = css('../../styles/learn-sleep-title.css')
const sparksCss = css('../../styles/memory-sparks.css')
const kf = name => title.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? ''

describe('период и сдвиг мерцания надписи совпадают с искрами', () => {
  const sp = tearSparks(90, 36, 178)
  it('главное мерцание — это первый разряд (BOLT_T[0]), редкое — дуга (ARC_T)', () => {
    expect(titleFlicker.bolt).toEqual(timingVars(BOLT_T[0][0], BOLT_T[0][1]))
    expect(titleFlicker.arc).toEqual(timingVars(ARC_T[0], ARC_T[1]))
    expect(sp.bolts[0].period).toBe(BOLT_T[0][0])
    expect(sp.bolts[0].delay).toBe(BOLT_T[0][1])
    expect(sp.arc.period).toBe(ARC_T[0])
    expect(sp.arc.delay).toBe(ARC_T[1])
    expect(titleFlicker.bolt['--p']).toBe(`${sp.bolts[0].period}s`)
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
    expect(title).toMatch(/animation: lrTitleShort var\(--p[^)]*\) linear var\(--d[^)]*\) infinite/)
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
  it('вспышка короткая: ≈ 160–260 мс, в начале периода; остальное время — покой (opacity 1, сдвиг 0)', () => {
    for (const [name, period] of [['lrTitleBolt', BOLT_T[0][0]], ['lrTitleArc', ARC_T[0]]]) {
      const frames = [...kf(name).matchAll(/([\d.,%\s]+)\{([^}]*)\}/g)].map(m => ({
        at: m[1].split(',').map(s => parseFloat(s)), body: m[2],
      }))
      const rest = frames.filter(f => /opacity: 1;/.test(f.body) && !/translateX\([^0]/.test(f.body))
      expect(rest.some(f => f.at.includes(0)), `${name}: старт в покое`).toBe(true)
      expect(rest.some(f => f.at.includes(100)), `${name}: конец в покое`).toBe(true)
      const active = frames.filter(f => !/opacity: 1;/.test(f.body)).flatMap(f => f.at)
      const end = frames.filter(f => f.at.length === 2).map(f => f.at[0])[0]
      const ms = (end - Math.min(...active)) / 100 * period * 1000
      expect(ms, `${name}: длительность мерцания`).toBeGreaterThan(160)
      expect(ms, `${name}: длительность мерцания`).toBeLessThan(260)
      expect(Math.min(...active) / 100 * period, `${name}: вспышка в самом начале периода`).toBeLessThan(0.2)
    }
  })
  it('в скрытой вкладке и при «уменьшить движение» стоит; JS-таймеров в разметке нет', () => {
    expect(title).toMatch(/\.shellV2TabHidden \.lrMainDone \.lrMainTitle,[\s\S]*?\.lrMainFlick,[\s\S]*?::after \{ animation: none; \}/)
    expect(title).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.lrMainFlick,[\s\S]*?animation: none/)
    expect(read('./LearnMainAction.jsx')).not.toMatch(/setInterval|setTimeout|requestAnimationFrame/)
  })
})
