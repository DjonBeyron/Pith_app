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
    // «вы ошиблись» (v3.3.355, текст «Вы ошиблись, пушистик остаётся в коробке, до встречи» утвердил владелец): форма множественного числа рода не имеет — разрешена; «ты ошибся / ошиблась» по-прежнему нельзя
    const bad = /(ошибся|ошиблась|справился|справилась|ответил|ответила|не успел|не успела|сказал|сказала)(\s|,|$)/
    for (const l of MIA_LINES) expect(l.text.toLowerCase(), l.id).not.toMatch(bad)
  })
  it('утверждённые владельцем тексты на месте (редакция 2026-11-24)', () => {
    const t = Object.fromEntries(MIA_LINES.map(l => [l.id, l.text]))
    expect(t.mia_push).toBe('Посиди в коробке, пушистик, дальше командую я'); expect(t.mia_announce_1).toBeUndefined(); expect(t.mia_attention).toBeUndefined() // склеены с mia_push / mia_announce_2
    expect(t.pit_reply).toBe('зря стараешься, я не буду молчать'); expect(t.mia_announce_2).toBe('Это не важно, я ускоряю игру и проверю каждое забытое слово')
    expect(t.mia_announce_3).toBe('Выйдешь, когда кое-кто ответит верно, три раза подряд'); expect(t.mia_leave).toBe('Ах так, ладно, твоя взяла, я ещё вернусь')
    expect(t.mia_ok_3).toBe('Не привыкай'); expect(t.mia_miss_3).toBe('Не торопись, а зря')
    expect(t.pit_back_1).toBe('Спасибо за помощь, вот это у неё характер'); expect(t.pit_back_2).toBe('Едем дальше, теперь я говорю по-английски, а ты называешь перевод')
    expect(t.mia_end).toBe('Время вышло, забирайте своего Пита, так и быть, ваши ошибки я запомнила')
    expect(t.boss_mia_hush).toBe('Сиди тихо, пушистик, теперь командую я'); expect(t.boss_mia_exam).toBeUndefined(); expect(t.boss_mia_think).toBeUndefined()
    expect(t.boss_mia_go).toBe('я запускаю слова'); expect(t.boss_mia_bye).toBe('Коробка мне ещё пригодится, пока'); expect(t.boss_pit_well).toBe('Ух, спасибо, эти слова ты уже помнишь гораздо лучше')
    expect(t.boss_mia_keep).toBe('Есть ошибки, пушистик остаётся в коробке, до встречи'); expect(t.boss_pit_try).toBe('Эй, ты куда? Так и оставишь меня в коробке?')
    expect([1, 2, 3].map(n => t[`boss_mia_miss_${n}`])).toEqual(['Мимо, трофеи за это слово мои', 'Слово ушло, трофеи тоже', 'Забыли слово, трофеи заберу я'])
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
    expect(MIA.PUSH_AT).toBeLessThan(MIA.PANIC_AT) // остальные реплики церемонии идут очередью по концу звука
  })
  it('variantOf: 1…3 по кругу', () => {
    expect([1, 2, 3, 4, 7].map(n => variantOf('mia_ok', n))).toEqual(['mia_ok_1', 'mia_ok_2', 'mia_ok_3', 'mia_ok_1', 'mia_ok_1'])
    expect(miaLine('нет_такой')).toBeNull()
  })
})
