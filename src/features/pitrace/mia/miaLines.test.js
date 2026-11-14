import { describe, it, expect } from 'vitest'
import { MIA_LINES, MIA_LINE_IDS, miaLine, variantOf } from './miaLines.js'
import { MIA, reduceMia, miaInit } from './raceMia.js'

describe('реплики Мии и Пита в эпизоде', () => {
  it('ключи уникальны, у каждой реплики есть кто, текст и когда', () => {
    expect(new Set(MIA_LINE_IDS).size).toBe(MIA_LINES.length)
    for (const l of MIA_LINES) { expect(['mia', 'pit']).toContain(l.who); expect(l.text.length).toBeGreaterThan(3); expect(l.when.length).toBeGreaterThan(10) }
  })
  it('тексты готовы к озвучке: нет точек, многоточий, восклицательных знаков и тире', () => {
    for (const l of MIA_LINES) expect(l.text, l.id).not.toMatch(/[.…!—–]/)
  })
  it('Мия обращается на «вы» (нет рода у ученика): без «ты», «тебе», «тебя»', () => {
    for (const l of MIA_LINES.filter(x => x.who === 'mia')) expect(l.text.toLowerCase(), l.id).not.toMatch(/(^|\s)(ты|тебе|тебя|тобой)(\s|,|$)/)
  })
  it('реплики короткие: до 100 знаков (длинное делится на две)', () => {
    for (const l of MIA_LINES) expect(l.text.length, l.id).toBeLessThanOrEqual(100)
  })
  it('каждая реплика, которую называет машина, есть в таблице', () => {
    const st = { type: 'student', act: 'sprint', sid: 'sprint2', words: [{ text: 'a' }] }
    let m = miaInit(); const used = new Set()
    const feed = (t, extra = {}) => { const r = reduceMia(m, { t, stage: st, idx: 0, now: 1, ...extra }); m = r.mia; r.say.forEach(l => used.add(l.id)) }
    feed('miss'); for (const t of ['win', 'win', 'miss', 'miss', 'miss', 'miss', 'win', 'win', 'win']) feed(t)
    feed('enter', { stage: { type: 'student', act: 'catch', sid: 'catch' } })
    for (const id of used) expect(miaLine(id), id).not.toBeNull()
    expect(MIA.ANNOUNCE2_AT).toBeGreaterThan(MIA.ANNOUNCE_AT)
  })
  it('variantOf: 1…3 по кругу', () => {
    expect([1, 2, 3, 4, 7].map(n => variantOf('mia_ok', n))).toEqual(['mia_ok_1', 'mia_ok_2', 'mia_ok_3', 'mia_ok_1', 'mia_ok_1'])
    expect(miaLine('нет_такой')).toBeNull()
  })
})
