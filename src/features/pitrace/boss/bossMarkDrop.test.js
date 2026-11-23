import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { marksStep, MARK_FADE_MS, MARKS_MAX } from './bossScale.js'

// Треугольники шкалы финала (правило владельца 2026-11-22): треугольник показывает, ГДЕ на линейке засчитан верный ответ; пока верного ответа нет — едет за пилюлей вниз;
// «если ответа нет, то в самом низу треугольник исчезает»; на шкале живут два треугольника — предыдущий и текущий.
const alive = s => s.filter(m => !m.dying).map(m => [m.id, Number(m.y.toFixed(2))])

describe('треугольник слова на шкале', () => {
  it('верный ответ: треугольник встаёт ровно на место ответа и больше не едет вниз, даже если линия ушла ниже', () => {
    let s = marksStep([], { id: 1, y: 0.2, now: 0 })
    s = marksStep(s, { id: 1, y: 0.5, now: 100 })                 // пилюля едет — треугольник за ней
    s = marksStep(s, { id: 1, y: 0.42, now: 200, set: true })     // слово принято: место ответа 0,42 (выше места зачёта)
    expect(alive(s)).toEqual([[1, 0.42]])
    s = marksStep(s, { id: 1, y: 0.42, now: 900 })
    expect(alive(s)).toEqual([[1, 0.42]])
  })
  it('неверный ответ, пилюля едет дальше: треугольник едет за ней; потом верный — фиксируется на верном', () => {
    let s = marksStep([], { id: 1, y: 0.3, now: 0 })
    s = marksStep(s, { id: 1, y: 0.7, now: 500 })                 // сказано неверно, пилюля уехала ниже
    expect(alive(s)).toEqual([[1, 0.7]])
    s = marksStep(s, { id: 1, y: 0.68, now: 600, set: true })
    expect(alive(s)).toEqual([[1, 0.68]])
  })
  it('ответа нет («не успел»): треугольник доехал до низа и гаснет; нового для этого слова не появляется', () => {
    let s = marksStep([], { id: 1, y: 0.5, now: 0 })
    s = marksStep(s, { id: 1, y: 1, now: 1000 })
    s = marksStep(s, { id: 1, y: 1, now: 1010, drop: true })
    expect(alive(s)).toEqual([]); expect(s[0]).toMatchObject({ id: 1, y: 1, dying: 1010 })
    s = marksStep(s, { id: 1, y: 1, now: 1010 + MARK_FADE_MS + 50, drop: true })
    expect(s).toEqual([])                                         // узел освобождён, заново не создан
  })
  it('на шкале два треугольника — прежний верный ответ и текущее слово; пропущенное слово прежний не вытесняет', () => {
    expect(MARKS_MAX).toBe(2)
    let s = marksStep([], { id: 1, y: 0.4, now: 0, set: true })   // слово 1 — верно
    s = marksStep(s, { id: 2, y: 1, now: 1000 })                  // слово 2 — доехало до низа
    s = marksStep(s, { id: 2, y: 1, now: 1010, drop: true })      // не успел — гаснет
    s = marksStep(s, { id: 3, y: 0.2, now: 2000 })                // слово 3 в работе
    expect(alive(s)).toEqual([[1, 0.4], [3, 0.2]])
  })
  it('шкала сообщает «ответа нет» только для слова, кончившегося без зачёта (источник)', () => {
    const src = readFileSync(new URL('./RaceBossScale.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/tr\.done && was !== tr && !pills\.find\(p => p\.el === tr\.el\)\?\.locked\) lost = tr\.id/)
    expect(src).toContain('drop: !!tr && tr.id === lost')
  })
})

describe('пилюля-пример на объяснении шкалы: короткий смысл слов Мии (владелец 2026-11-23)', () => {
  it('в зелёной зоне «Знаю», в жёлтой «Вспоминаю», в красной «Не помню»; до зелёной и на «условии» — пусто', async () => {
    const { demoPlan, demoCaption, DEMO_CAPS } = await import('./bossScale.js')
    const plan = demoPlan({ look: 2000, think: 2500, green: 1500, yellow: 1700, red: 1600, five: 4000 })
    expect(demoCaption(plan, 0)).toBe(''); expect(demoCaption(plan, plan.starts.think + 100)).toBe('')
    expect(demoCaption(plan, plan.starts.green + 200)).toBe(DEMO_CAPS.green); expect(DEMO_CAPS.green).toBe('Знаю')
    expect(demoCaption(plan, plan.starts.yellow + 200)).toBe('Вспоминаю'); expect(demoCaption(plan, plan.starts.red + 200)).toBe('Не помню')
    expect(demoCaption(plan, plan.starts.five + 10)).toBe('')
  })
})
