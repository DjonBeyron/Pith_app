import { describe, it, expect } from 'vitest'
import { createStartChron, longestStep, START_VOICE_MS, CHRON_WINDOW_MS } from './raceStartChron.js'
import { createStartTrace, RACE_ENTRY_LINE_MS, RACE_SETTLE_QUIET_MS } from './raceStartTrace.js'
import { SETTLE_QUIET_MS } from '../../shared/lib/gameAudioWarm.js'

// Хронология старта «[start]»: мс от тапа «Начать», каждый шаг один раз, в конце — итог «от входа в игру до голоса M мс (цель ≤ 400), от тапа «Голосом» до голоса N мс; самый долгий шаг …», «ДОЛЬШЕ».
function mk() {
  let t = 0
  const out = []
  const c = createStartChron({ now: () => t, log: s => out.push(s) })
  return { c, out, go: ms => { t = ms } }
}

describe('хронология старта [start]', () => {
  it('без тапа «Начать» молчит (другие игры, репетиция)', () => {
    const { c, out } = mk()
    expect(c.step('gum', 'x')).toBeNull(); expect(c.voice()).toBeNull(); expect(out).toEqual([])
  })
  it('шаги — мс от тапа, каждый один раз; итог по голосу: вход → голос, ответ → голос, самый долгий шаг', () => {
    const { c, out, go } = mk()
    c.tap(); go(50); c.step('ctx', 'AudioContext running'); go(900); c.ask('voice'); go(905); c.step('gum', 'getUserMedia вызван')
    go(1400); c.step('mic', 'getUserMedia ответил'); go(1400); c.step('mic', 'повтор'); go(1530); c.step('enter', 'вход в игру'); go(1620)
    const r = c.voice({ id: 'race_sprint' })
    expect(out[0]).toBe('[start] +0 мс тап «Начать» (жест): сцена с попапом, тихий прогрев')
    expect(out).toContain('[start] +900 мс тап «Голосом»'); expect(out.filter(s => s.startsWith('[start] +') && s.includes('ответил'))).toHaveLength(1); expect(out.some(s => s.includes('повтор'))).toBe(false)
    expect(out).toContain('[start] +1620 мс голос Пита: источник звука стартовал («race_sprint»)')
    expect(r).toEqual({ entry: 90, ask: 720, longest: { label: 'getUserMedia ответил', prev: 'getUserMedia вызван', ms: 495 } })
    expect(out.at(-1)).toBe('[start] итог: от входа в игру до голоса Пита 90 мс (цель ≤ 400), от тапа «Голосом» до голоса 720 мс; самый долгий шаг — «getUserMedia ответил» (495 мс после «getUserMedia вызван»)')
    expect(c.voice()).toBeNull() // итог один раз за запуск
  })
  it('голос позже 400 мс после входа — «ДОЛЬШЕ»; первая реплика без звука помечена', () => {
    const { c, out, go } = mk()
    c.tap(); c.ask('tap'); go(10); c.step('enter', 'вход в игру'); go(10 + START_VOICE_MS + 1)
    c.voice({ voiced: false })
    expect(out.at(-1)).toMatch(/итог: от входа в игру до голоса Пита 401 мс .*от тапа «Пальцами».* — ДОЛЬШЕ \(без звука\)$/)
    expect(START_VOICE_MS).toBe(RACE_ENTRY_LINE_MS)
  })
  it('повторный ответ (микрофон не дали → «Пальцами»): шаги прошлой попытки стёрты, итог по новой', () => {
    const { c, out, go } = mk()
    c.tap(); go(500); c.ask('voice'); go(600); c.step('mic', 'getUserMedia ответил: denied'); go(2000); c.ask('tap'); go(2010); c.step('mic', 'не должен быть'); c.step('enter', 'вход'); go(2100)
    expect(c.voice().ask).toBe(100)
    expect(out.some(s => s.includes('+2010 мс не должен быть'))).toBe(true) // шаг снова доступен после повторного ответа
    expect(c.steps().map(s => s.name)).toEqual(['tap', 'ask', 'mic', 'enter', 'voice'])
  })
  it('окно хронологии: позже CHRON_WINDOW_MS и после отмены шаги не пишутся', () => {
    const { c, out, go } = mk()
    c.tap(); go(CHRON_WINDOW_MS + 1); expect(c.step('x', 'поздно')).toBeNull()
    c.tap(); c.cancel(); expect(c.step('y', 'отменён')).toBeNull(); expect(out).toHaveLength(2)
  })
  it('самый долгий шаг считается от ответа на попап (раздумья человека в попапе — не шаг)', () => {
    expect(longestStep([{ name: 'tap', label: 'a', at: 0 }, { name: 'ask', label: 'b', at: 5000 }, { name: 'c', label: 'c', at: 5100 }, { name: 'd', label: 'd', at: 5150 }])).toEqual({ label: 'c', prev: 'b', ms: 100 })
    expect(longestStep([{ name: 'tap', label: 'a', at: 0 }])).toBeNull()
  })
})

describe('raceStartTrace ведёт шаги вход / Пит / голос', () => {
  it('ответ, вход, Пит, голос — в хронологию; Пит без отдельного выскакивания — «вместе с голосом»', () => {
    const steps = []
    const chron = { ask: c => steps.push(`ask:${c}`), step: n => steps.push(n), voice: o => steps.push(`voice:${o.id}`) }
    let t = 0
    const tr = createStartTrace({ now: () => t, log: () => {}, chron })
    tr.ask('voice'); t = 10; tr.begin(); t = 50; tr.line({ id: 'race_start' })
    expect(steps).toEqual(['ask:voice', 'enter', 'pit', 'voice:race_start'])
    steps.length = 0; tr.ask('tap'); tr.begin(); tr.pit(); tr.line()
    expect(steps).toEqual(['ask:tap', 'enter', 'pit', 'voice:null'])
  })
  it('«Готовлю звук» у гонки короче: тишина без прерываний 120 мс вместо 250', () => {
    expect(RACE_SETTLE_QUIET_MS).toBeLessThan(SETTLE_QUIET_MS); expect(RACE_SETTLE_QUIET_MS).toBe(120)
  })
})
