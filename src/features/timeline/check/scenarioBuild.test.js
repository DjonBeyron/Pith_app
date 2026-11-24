import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildScenario, YES_LINE, NO_LINE, SHOW_LINE, DONE_LINES } from './scenarioBuild.js'
import { gameStages, ceremonyCues, endCues } from './scenarioGame.js'
import { UNUSED_WHY } from './scenarioUnused.js'
import { RACE_LINE_SET } from '../../admin/speech/voiceAudit.js'
import { reduceMia, miaInit } from '../../pitrace/mia/raceMia.js'

// СТОРОЖ сценария из кода: если игра изменится (новая реплика, новая плашка, другой исход), эти тесты упадут и скажут, что именно разошлось с проверкой сценария.
const sc = buildScenario()
const src = rel => readFileSync(new URL(`../../pitrace/${rel}`, import.meta.url), 'utf8')
const block = key => sc.blocks.find(b => b.key === key)
const idsOf = (b, test = () => true) => b.parts.filter(test).flatMap(p => p.items.map(x => x.id))

describe('сценарий «Встряхни память» из кода игры', () => {
  it('блоки идут в порядке игры', () => {
    expect(sc.blocks.map(b => b.title)).toEqual(['Старт', 'Конвейер слов', 'Разворот конвейера', 'Фразы — круг «Скажи»', 'Допрос у Мии', 'Экзамен «Шкала памяти»', 'Итог'])
  })
  it('КАЖДАЯ реплика каталога «Встряхни память» — либо в сценарии, либо в списке «не звучит в игре» с причиной (и не там и там сразу)', () => {
    const lost = [...RACE_LINE_SET].filter(id => !sc.ids.has(id) && !UNUSED_WHY[id])
    expect(lost, `реплики каталога, которых нет ни в сценарии, ни в scenarioUnused.js: ${lost.join(', ')} — впиши в блок сценария (scenarioBuild.js) или в список с причиной`).toEqual([])
    const both = Object.keys(UNUSED_WHY).filter(id => sc.ids.has(id))
    expect(both, `помечены «не звучат», а игра их говорит: ${both.join(', ')} — убери из scenarioUnused.js`).toEqual([])
    expect(Object.keys(UNUSED_WHY).filter(id => !RACE_LINE_SET.has(id)), 'в scenarioUnused.js реплики, которых нет в каталоге').toEqual([])
    expect(sc.unused.every(u => u.why)).toBe(true)
  })
  it('в сценарии нет чужих id: только реплики каталога', () => { expect([...sc.ids].filter(id => !RACE_LINE_SET.has(id))).toEqual([]) })
  it('каждая реплика плашки, которую строит игра (голосом и пальцами), есть в сценарии', () => {
    const lines = [...gameStages(false), ...gameStages(true)].flatMap(s => [s.line, s.say]).filter(Boolean)
    expect(lines.length).toBeGreaterThan(4)
    expect(lines.filter(id => !sc.ids.has(id))).toEqual([])
  })
  it('продублированные строки игры (экспорта нет) совпадают с её исходником', () => {
    const voice = src('racePhraseVoice.js')
    expect(voice).toContain(`'${YES_LINE}'`); expect(voice).toContain(`{ line: '${NO_LINE}' }`)
    expect(src('raceStagesPhrases.js')).toContain(`line: '${SHOW_LINE}'`)
    expect(src('useRaceActs.js')).toContain(`res.gold ? '${DONE_LINES.gold}' : '${DONE_LINES.usual}'`)
  })
  it('вырезанный круг «Тапни фразу» в сценарий не идёт, круг «Скажи» — идёт', () => {
    expect(gameStages().some(s => /^phrases1/.test(s.sid))).toBe(false)
    expect(sc.ids.has('race_phrases_pick')).toBe(false)
    expect(idsOf(block('phrases'), p => !p.alt)).toEqual(expect.arrayContaining(['race_phrases', 'race_phrases_show', 'race_demo_1', 'race_phrases_say', 'race_phrase_again', 'race_phrase_yes', 'race_slip_word']))
  })
})

describe('допрос у Мии и экзамен — те же реплики и сроки, что у машины игры', () => {
  it('церемония Мии: реплика стадии и реплики reduceMia с их сроками', () => {
    const st = gameStages(), ann = st.find(s => s.sid === 'sprint3-ann'), r = reduceMia(miaInit(), { t: 'enter', stage: ann, now: 0 })
    const cer = block('mia').parts[0]
    expect(cer.items.map(x => x.id)).toEqual([ann.line, ...r.say.map(c => c.id)])
    expect(cer.cues.slice(1).map(c => c.delay)).toEqual(r.say.map(c => c.delay))
    expect(cer.items.map(x => x.who)).toEqual(['pit', ...r.say.map(c => c.who)])
  })
  it('варианты «одна из» собраны все: три «верно», три «мимо», три колкости экзамена, три подсказки Пита', () => {
    const mia = block('mia'), boss = block('boss'), variants = b => b.parts.filter(p => p.kind === 'variants').map(p => p.items.map(x => x.id))
    expect(variants(mia)).toEqual([['mia_ok_1', 'mia_ok_2', 'mia_ok_3'], ['mia_miss_1', 'mia_miss_2', 'mia_miss_3']])
    expect(variants(boss).slice(1)).toEqual([['boss_mia_miss_1', 'boss_mia_miss_2', 'boss_mia_miss_3'], ['boss_help_1', 'boss_help_2', 'boss_help_3']])
    expect(boss.parts.find(p => p.key === 'win0').items.every(x => x.again)).toBe(true) // те же колкости, что в допросе: в счёт идут один раз
  })
  it('концовки: «все верны» и «есть ошибки» — у допроса и у экзамена; ветка «Мию ещё не видели»', () => {
    for (const key of ['mia', 'boss']) {
      const ends = block(key).parts.filter(p => /^end/.test(p.key))
      expect(ends.length).toBeGreaterThanOrEqual(2)
      expect(ends[0].title).toBe('Концовка: все слова названы верно')
      expect(new Set(ends.map(p => p.items.map(x => x.id).join('+'))).size).toBe(ends.length)
    }
    expect(endCues(gameStages(), 'boss').at(0).cues.map(c => c.id)).toEqual(block('boss').parts.find(p => p.key === 'end0').items.map(x => x.id))
    expect(idsOf(block('boss'), p => p.key === 'cer-new')).toEqual(['boss_pit_new'])
    expect(ceremonyCues(gameStages(), 'boss', true).cues[0].id).toBe('boss_pit_1')
    expect(idsOf(block('mia'), p => /^box/.test(p.key))).toEqual(['boss_pit_try', 'boss_pit_stuck', 'boss_pit_faster', 'pit_back_1'])
  })
  it('экзамен: смена языка и «Следующее слово»', () => {
    expect(idsOf(block('boss'), p => p.key === 'hold')).toEqual(['boss_mia_ru'])
    expect(idsOf(block('boss'), p => p.key === 'fail2')).toEqual(['boss_pit_next'])
  })
})
