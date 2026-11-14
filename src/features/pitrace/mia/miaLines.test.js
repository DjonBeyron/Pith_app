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
  it('нет прошедшего времени второго лица (у него есть род): «ты ошибся», «вы справились» и подобное', () => {
    const bad = /(ошибся|ошиблась|ошиблись|справился|справилась|ответил|ответила|не успел|не успела|сказал|сказала)(\s|,|$)/
    for (const l of MIA_LINES) expect(l.text.toLowerCase(), l.id).not.toMatch(bad)
  })
  it('утверждённые владельцем тексты (2026-11-14) на месте', () => {
    const t = Object.fromEntries(MIA_LINES.map(l => [l.id, l.text]))
    expect(t.mia_push).toBe('Иди сюда, пушистик, дальше командую я'); expect(t.mia_announce_1).toBe('Посиди в коробке, понял?')
    expect(t.pit_reply).toBe('Ладно, но я всё равно буду говорить, меня не остановить'); expect(t.mia_announce_2).toBe('Хватит играться, я ускоряю игру, проверю каждое забытое слово')
    expect(t.mia_announce_3).toBe('Выпущу пушистика, если ты ответишь верно три раза подряд'); expect(t.mia_leave).toBe('Ах так, ладно, вы победили, я ещё вернусь')
    expect(t.pit_back_1).toBe('Спасибо за помощь, вот это у неё характер'); expect(t.pit_back_2).toBe('Постарайся не ошибаться, я не хочу обратно')
    expect(t.mia_end).toBe('Время вышло, забирайте своего Пита, так и быть, ваши ошибки я запомнила')
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
    expect([MIA.PUSH_AT, MIA.ANNOUNCE_AT, MIA.REPLY_AT, MIA.ANNOUNCE2_AT, MIA.ANNOUNCE3_AT]).toEqual([...[MIA.PUSH_AT, MIA.ANNOUNCE_AT, MIA.REPLY_AT, MIA.ANNOUNCE2_AT, MIA.ANNOUNCE3_AT]].sort((x, y) => x - y))
  })
  it('variantOf: 1…3 по кругу', () => {
    expect([1, 2, 3, 4, 7].map(n => variantOf('mia_ok', n))).toEqual(['mia_ok_1', 'mia_ok_2', 'mia_ok_3', 'mia_ok_1', 'mia_ok_1'])
    expect(miaLine('нет_такой')).toBeNull()
  })
})
