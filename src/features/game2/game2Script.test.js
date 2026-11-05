import { describe, it, expect } from 'vitest'
import { runSession } from './game2Script.js'
import { buildTimeline, phraseWords, dueFlags, timingsOf } from './timelinePlan.js'
import { planFor } from '../rehearsal/rehearsalFixtures.js'

// Сценарий сессии на поддельном окружении: без часов и звука. Проверяем порядок режимов, реплики Пита и повтор «Ловлю».
function setup({ fixture = 'three', catchResults = [] } = {}) {
  const plan = planFor('sim', { fixture })
  const words = phraseWords(plan), due = dueFlags(words, plan)
  const t = timingsOf(words, null)
  const said = [], modes = [], lanes = [], scores = []
  let stop = false
  const env = {
    cancelled: () => stop, log: () => {},
    say: async id => { said.push(id) },
    timeline: rate => buildTimeline({ words, due, ...t, rate }),
    show: async () => {},
    onMode: id => modes.push(id), onScore: s => scores.push(s), onDone: () => {},
    lane: async (mode, tl, pills) => {
      lanes.push(mode.id)
      const r = mode.id === 'catch' ? catchResults.shift() ?? { credited: pills.length, missed: [] } : { credited: pills.length, missed: [] }
      return { total: pills.length, ...r }
    },
  }
  return { env, said, modes, lanes, scores, due: due.filter(Boolean).length, cancel: () => { stop = true } }
}

describe('сценарий сессии', () => {
  it('все режимы по порядку, перед каждым — своя реплика Пита; итог в конце', async () => {
    const s = setup()
    const score = await runSession(s.env, { dueCount: s.due })
    expect(s.modes).toEqual(['start', 'listen', 'catch', 'shadow', 'recall', 'speed', 'done'])
    expect(s.said).toEqual(['rh2_start', 'rh2_listen', 'rh2_catch', 'rh2_shadow', 'rh2_recall', 'rh2_shadow_next', 'rh2_done'])
    expect(s.lanes).toEqual(['listen', 'catch', 'shadow', 'recall', 'speed'])
    expect(score.catch).toEqual({ hit: 2, total: 2 }); expect(score.shadow).toEqual({ hit: 4, total: 4 })
  })
  it('«Ловлю»: промах → rh2_catch_miss и один повтор; второй промах не повторяется', async () => {
    const s = setup({ catchResults: [{ credited: 1, missed: [3] }, { credited: 1, missed: [3] }] })
    await runSession(s.env, { dueCount: s.due })
    expect(s.lanes.filter(m => m === 'catch')).toHaveLength(2)
    expect(s.said.filter(id => id === 'rh2_catch')).toHaveLength(1)
    expect(s.said.filter(id => id === 'rh2_catch_miss')).toHaveLength(1)
    expect(s.modes.slice(0, 5)).toEqual(['start', 'listen', 'catch', 'catch', 'shadow'])
  })
  it('повтор «Ловлю» удался — идём дальше; результат — лучшая попытка', async () => {
    const s = setup({ catchResults: [{ credited: 1, missed: [3] }, { credited: 2, missed: [] }] })
    const score = await runSession(s.env, { dueCount: s.due })
    expect(s.lanes.filter(m => m === 'catch')).toHaveLength(2)
    expect(score.catch).toEqual({ hit: 2, total: 2 })
  })
  it('нет слов «к повтору» — «Ловлю» пропущено, в итоге прочерк', async () => {
    const s = setup({ fixture: 'none' })
    const score = await runSession(s.env, { dueCount: 0 })
    expect(s.modes).not.toContain('catch'); expect(score.catch.total).toBe(0)
  })
  it('«Скорость» просит ленту со сжатием ×1,2, остальные — ×1', async () => {
    const s = setup()
    const rates = []
    const tl = s.env.timeline
    s.env.timeline = rate => { rates.push(rate); return tl(rate) }
    await runSession(s.env, { dueCount: s.due })
    expect(rates).toEqual([1, 1, 1, 1, 1, 1.2])
  })
  it('отмена (выход, пауза) обрывает сценарий; продолжение — с нужного режима и с накопленным счётом', async () => {
    const s = setup()
    s.env.say = async id => { s.said.push(id); if (id === 'rh2_shadow') s.cancel() }
    expect(await runSession(s.env, { dueCount: s.due })).toBeNull()
    expect(s.lanes).toEqual(['listen', 'catch'])
    const r = setup()
    const prev = { catch: { hit: 2, total: 2 }, shadow: { hit: 0, total: 0 }, recall: { hit: 0, total: 0 }, speed: { hit: 0, total: 0 } }
    const score = await runSession(r.env, { from: 'recall', dueCount: r.due, score: prev })
    expect(r.modes).toEqual(['recall', 'speed', 'done']); expect(score.catch.hit).toBe(2)
  })
})
