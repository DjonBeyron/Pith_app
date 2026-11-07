import { describe, it, expect } from 'vitest'
import { RACE_LINES, RACE_LINE_IDS } from './raceLines.js'
import { CAT_LINES, LINE_IDS, normalizeLines, linesItems, lineKey, MAX_LINE_CHARS } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { isStaleLine, lineVoiced } from '../rehearsal/rehearsalLines.js'
import { missingPitLines, pitVoiceCount } from '../rehearsal/rehearsalVoice.js'

describe('реплики Пита в гонке: каталог', () => {
  it('ключи race_*, тексты из задания (последний — вопрос плашки «Голосом / Пальцами»)', () => {
    expect(RACE_LINE_IDS).toEqual(['race_start', 'race_start_tap', 'race_sprint', 'race_sprint_tap', 'race_good_1', 'race_good_2', 'race_good_3', 'race_good_4', 'race_good_ok', 'race_sprint_round2', 'race_catch', 'race_catch_tap', 'race_switch_ru', 'race_climb', 'race_climb_slip', 'race_trap_pre', 'race_trap_mid', 'race_trap_short', 'race_climb_top', 'race_climb_time', 'race_descent', 'race_done_gold', 'race_done', 'race_ask_voice', 'race_phrases', 'race_phrases_tap', 'race_phrases_pick', 'race_phrases_say', 'race_phrases_hear', 'race_phrase_yes', 'race_phrase_no'])
    const t = Object.fromEntries(RACE_LINES.map(l => [l.id, l.text]))
    expect(t.race_start).toBe('Встряхнём память, я говорю слова, а ты переводишь вслух'); expect(t.race_start_tap).toBe('Встряхнём память, я говорю слова, а ты ловишь перевод')
    expect(t.race_sprint).toBe('Вспомни на слух, перевод едет вниз, скажи слово по-английски, пока не убежало')
    expect([1, 2, 3, 4].map(k => t[`race_good_${k}`])).toEqual(['отличное произношение', 'звучит очень хорошо', 'вот это да, чисто', 'как носитель, ну почти'])
    expect(t.race_sprint_tap).toBe('Вспомни на слух, я говорю перевод, а ты тапни нужное слово, пока не убежало'); expect(t.race_catch_tap).toBe('теперь наоборот, я говорю по-английски, а ты тапни перевод') // тап-варианты: тапни вместо «скажи»
    expect(t.race_good_ok).toBe('Отлично') // проход B: просто «Отлично», без похвалы за произношение
    expect(t.race_sprint_round2).toBe('а теперь давай повысим скорость')
    expect(t.race_sprint_streak).toBeUndefined(); expect(t.race_sprint_fire).toBeUndefined() // серий «ну, погнали» и «огонь» больше нет
    expect(t.race_catch).toBe('теперь наоборот, я говорю по-английски, а ты называешь перевод')
    expect(t.race_switch_ru).toBe('секунду, переключаюсь на русский')
    expect(t.race_catch_miss).toBeUndefined() // «мимо, слушай ещё» ушла вместе с заходами «Слушай и лови»: этап 2 — инверсия разгона, повторных заходов нет
    expect(t.race_climb).toBe('Вершина, собираем фразу по слову, с каждым шагом длиннее'); expect(t.race_climb_slip).toBe('ой, соскользнул, ещё раз'); expect(t.race_climb_top).toBe('Вершина, вот так это и звучит'); expect(t.race_climb_time).toBe('время вышло, но ты высоко забрался')
    expect(t.race_trap_pre).toBe('это'); expect(t.race_trap_mid).toBe('а нужно'); expect(t.race_trap_short).toBe('мимо, это двойник') // ловушка-двойник: «это {двойник}, а нужно {слово}» собирается из кусков (raceTrapVoice.js)
    expect(t.race_descent).toBe('Спуск, повтори всю фразу за мной на скорости')
    expect(t.race_done_gold).toBe('Золото, идеально'); expect(t.race_done).toBe('Финиш, завтра ещё заезд?')
    expect(t.race_ask_voice).toBe('Как будешь ловить слова, голосом или руками?')
    expect(t.race_phrases).toBe('теперь фразы, сначала выбирай, потом говори'); expect(t.race_phrases_tap).toBe('теперь фразы, сначала выбирай фразу, потом её смысл')
    expect(t.race_phrases_pick).toBe('я описываю ситуацию, а ты тапни фразу, которая подходит'); expect(t.race_phrases_say).toBe('а теперь скажи её сам, я подскажу смысл, а слова спрятаны'); expect(t.race_phrases_hear).toBe('теперь я говорю фразу, а ты тапни, что она значит')
    expect(t.race_phrase_yes).toBe('да, это оно'); expect(t.race_phrase_no).toBe('нет, это про другое') // этап 2 «Фразы»
  })
  it('для озвучки: без точек, многоточий, восклицательных знаков и тире; не длиннее предела; у каждой есть «когда»', () => {
    for (const l of RACE_LINES) {
      expect(l.text).not.toMatch(/[.…!—–]/)
      expect(l.text.length).toBeLessThanOrEqual(MAX_LINE_CHARS)
      expect(l.when).toBeTruthy()
    }
  })
  it('входят в общий каталог кота рядом с rh_*, ключи уникальны; редактор ноды и настройки видят их сами', () => {
    expect(LINE_IDS).toEqual(expect.arrayContaining(RACE_LINE_IDS))
    expect(new Set(LINE_IDS).size).toBe(LINE_IDS.length)
    expect(CAT_LINES.slice(-RACE_LINES.length).map(l => l.id)).toEqual(RACE_LINE_IDS)
    expect(Object.keys(normalizeLines(null))).toEqual(LINE_IDS)
    expect(normalizeLines(null).race_catch_miss).toBeUndefined()
  })
  it('озвучка — как у остальных реплик: url → слот тапа «Начать»; сохранённый старый текст — озвучка устарела и сбрасывается', () => {
    const l = normalizeLines({ lines: { race_start: { text: 'Встряхнём память, я говорю слова, а ты переводишь вслух', url: 'u', duration: 3 }, race_done: { text: 'старый текст', url: 'x', duration: 2 } } })
    expect(linesItems(l)).toEqual([{ key: lineKey('race_start'), url: 'u' }])
    expect(isStaleLine('race_done', 'старый текст')).toBe(true)
    expect(l.race_done.url).toBeNull()
    expect(lineVoiced('race_start', l.race_start)).toBe(true); expect(lineVoiced('race_done', l.race_done)).toBe(false)
  })
  it('озвучка в админке с фильтром: считается только по гонке, реплики репетиции не мешают', () => {
    expect(pitVoiceCount(null, RACE_LINES)).toEqual({ done: 0, total: RACE_LINES.length })
    expect(missingPitLines(normalizeLines({ lines: { race_start: { text: RACE_LINES[0].text, url: 'u', duration: 1 } } }), RACE_LINES).map(x => x.id)).not.toContain('race_start')
    expect(missingPitLines(null, RACE_LINES)).toHaveLength(RACE_LINES.length)
  })
})
