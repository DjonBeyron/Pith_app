import { describe, it, expect } from 'vitest'
import { MODES, MODE_IDS, SEQUENCE, nextStep, resumeFrom, dbGain, SHADOW_DB, SPEED_UP, GAME2_LINES, MAX_CATCH_TRIES } from './game2Modes.js'
import { REHEARSAL_LINES } from '../rehearsal/rehearsalLines.js'
import { CAT_LINES, normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { emptyScore, withResult, summaryRows } from './game2Score.js'

describe('режимы «Мини-игры 2.0»', () => {
  it('порядок: старт → слушаю → ловлю → тень → по памяти → скорость → итог', () => {
    expect(SEQUENCE).toEqual(['start', 'listen', 'catch', 'shadow', 'recall', 'speed', 'done'])
    const got = ['start']
    for (let s = nextStep('start', { dueCount: 2 }); s; s = nextStep(s.mode, { dueCount: 2 })) got.push(s.mode)
    expect(got).toEqual(SEQUENCE)
  })
  it('у каждого режима своя реплика Пита rh2_*, и она есть в каталоге (озвучивается кнопкой «Озвучить реплики»)', () => {
    expect(GAME2_LINES).toHaveLength(8)
    for (const id of GAME2_LINES) { expect(CAT_LINES.some(l => l.id === id), id).toBe(true); expect(REHEARSAL_LINES.find(l => l.id === id).when).toMatch(/^Мини-игра 2\.0 \(стенд\)/) }
    for (const m of SEQUENCE) expect(MODES[m].line).toBe(`rh2_${m}`)
    expect(normalizeLines(null).rh2_catch_miss.text).toBe('Проскочило, слушай ещё раз')
    expect(normalizeLines(null).rh2_done.text).toBe('Вот так это и звучит, хочешь ещё?')
  })
  it('что видно на ленте: «Слушаю» и «Тень» — все слова с подписями, «Ловлю» — только к повтору без подписей, «По памяти» — без подписей и без голоса', () => {
    expect([MODES.listen.show, MODES.listen.labels, MODES.listen.voice]).toEqual(['all', true, true])
    expect([MODES.catch.show, MODES.catch.labels, MODES.catch.input]).toEqual(['due', false, 'catch'])
    expect([MODES.shadow.show, MODES.shadow.labels, MODES.shadow.input]).toEqual(['all', true, 'shadow'])
    expect([MODES.recall.show, MODES.recall.labels, MODES.recall.voice, MODES.recall.hint]).toEqual(['all', false, false, true])
    expect(MODES.start.show).toBe('none')
  })
  it('«Тень» тише на 6 дБ (GainNode), «Скорость» — ×1,2 и тоже тише; окна: «Ловлю» 0,8 с, «Тень» 1 с', () => {
    expect(SHADOW_DB).toBe(-6); expect(MODES.shadow.gain).toBeCloseTo(0.501, 3); expect(dbGain(0)).toBe(1)
    expect(MODES.speed.rate).toBe(SPEED_UP); expect(MODES.speed.rate).toBe(1.2); expect(MODES.speed.gain).toBe(MODES.shadow.gain)
    expect([MODES.catch.window, MODES.shadow.window, MODES.recall.window]).toEqual([800, 1000, 1000])
    expect(MODES.listen.rate).toBe(1); expect(MODES.listen.gain).toBe(1)
  })
})

describe('«Ловлю»: повтор после промаха', () => {
  it('есть непойманные слова — тот же режим ещё раз с репликой rh2_catch_miss, но только один повтор', () => {
    expect(MAX_CATCH_TRIES).toBe(2)
    expect(nextStep('catch', { dueCount: 2, missed: 1, tries: 1 })).toEqual({ mode: 'catch', say: 'rh2_catch_miss' })
    expect(nextStep('catch', { dueCount: 2, missed: 1, tries: 2 })).toEqual({ mode: 'shadow', say: 'rh2_shadow' })
    expect(nextStep('catch', { dueCount: 2, missed: 0, tries: 1 })).toEqual({ mode: 'shadow', say: 'rh2_shadow' })
  })
  it('нет слов «к повтору» — «Ловлю» пропускается', () => {
    expect(nextStep('listen', { dueCount: 0 })).toEqual({ mode: 'shadow', say: 'rh2_shadow' })
    expect(nextStep('listen', { dueCount: 1 })).toEqual({ mode: 'catch', say: 'rh2_catch' })
  })
  it('после паузы сессия идёт с текущего режима, «Старт» заново не играется', () => {
    expect(resumeFrom('shadow')).toBe('shadow'); expect(resumeFrom('start')).toBe('listen'); expect(resumeFrom(null)).toBe('listen')
  })
})

describe('итог', () => {
  it('результат режима: повтор «Ловлю» не ухудшает лучшую попытку', () => {
    let s = withResult(emptyScore(), 'catch', 1, 2)
    s = withResult(s, 'catch', 2, 2); expect(s.catch).toEqual({ hit: 2, total: 2 })
    s = withResult(s, 'catch', 0, 2); expect(s.catch).toEqual({ hit: 2, total: 2 })
    s = withResult(s, 'shadow', 3, 4)
    expect(summaryRows(s).map(r => r.text)).toEqual(['2 из 2', '3 из 4', '—', '—'])
    expect(summaryRows(emptyScore()).every(r => r.text === '—')).toBe(true)
  })
})

describe('сигнал «говори»', () => {
  it('ход пользователя — «Ловлю», «Тень», «По памяти», «Скорость»; «Слушаю» и служебные режимы — нет; у каждого режима с лентой своя строка-инструкция', () => {
    expect(MODE_IDS.filter(id => MODES[id].turn)).toEqual(['catch', 'shadow', 'recall', 'speed'])
    expect(MODE_IDS.filter(id => MODES[id].turn).every(id => MODES[id].input !== 'none')).toBe(true)
    expect(MODES.listen.instr).toBe('Слушай и смотри, говорить не надо')
    expect(MODES.catch.instr).toBe('Скажи слово, когда услышишь его')
    expect(MODES.shadow.instr).toBe('Говори вместе с Питом')
    expect(MODES.recall.instr).toBe('Скажи фразу сам')
    expect(MODES.speed.instr).toBe('Ещё раз, быстрее')
    for (const id of ['listen', 'catch', 'shadow', 'recall', 'speed']) expect(MODES[id].plate).toBeTruthy()
  })
})
