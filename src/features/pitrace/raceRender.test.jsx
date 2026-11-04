import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceSummary from './RaceSummary.jsx'
import RaceActs from './RaceActs.jsx'
import RaceHowto from './RaceHowto.jsx'
import RaceBlock from '../admin/speech/RaceBlock.jsx'
import RehearsalActs from '../rehearsal/RehearsalActs.jsx'
import { initClimb } from './raceLadder.js'
import { HOWTO_STEPS, HOWTO_TITLE, howtoMarkdown } from './raceHowto.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { raceDebugFile } from './raceLog.js'

vi.mock('../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const html = (el, props) => renderToStaticMarkup(createElement(el, props))

describe('итог (RaceSummary) и RaceActs', () => {
  const result = { sprint: { hit: 5, total: 7 }, catchOk: 2, catchTotal: 3, medal: 'silver', descent: 'ok', xp: 2, capped: false, gold: false }
  it('плашка итога: разгон N/M, слух N/3, вершина — медаль, спуск ✓, XP; «Ещё заезд» и «Нет»', () => {
    const h = html(RaceSummary, { plan, result, onAgain() {}, onDone() {} })
    expect(h).toContain('data-testid="race-summary-sprint">5/7<'); expect(h).toContain('data-testid="race-summary-catch">2/3<')
    expect(h).toContain('>серебро<'); expect(h).toContain('>✓<'); expect(h).toContain('>+2<')
    expect(h).toContain('data-testid="race-again"'); expect(h).toContain('>Ещё заезд<'); expect(h).toContain('>Нет<'); expect(h).toContain('wlTurn rhScreen rhSumPlate')
    expect(html(RaceSummary, { plan, result: { ...result, gold: true, medal: 'gold' }, onDone() {} })).toContain('raceSum--gold')
    const one = html(RaceSummary, { plan, result, onDone() {} }); expect(one).not.toContain('race-again'); expect(one).toContain('>Готово<')
    expect(html(RaceSummary, { plan, result: null, onDone() {} })).toContain('…')
  })
  it('итог: «Самые слабые слова» — чипы от слабых к сильным, цвет по слабости, перевод мелко; без слабых слов блока нет', () => {
    const weak = [{ text: 'learn', translation: 'учить', score: 5, tone: 'red' }, { text: 'try', translation: 'пробовать', score: 2, tone: 'yellow' }, { text: 'to', translation: '', score: 0, tone: 'green' }]
    const h = html(RaceSummary, { plan, result: { ...result, weak }, onDone() {} })
    expect(h).toContain('Самые слабые слова'); expect(h.match(/data-testid="race-weak-chip"/g)).toHaveLength(3)
    expect(h.indexOf('data-tone="red"')).toBeLessThan(h.indexOf('data-tone="yellow"')); expect(h.indexOf('data-tone="yellow"')).toBeLessThan(h.indexOf('data-tone="green"'))
    expect(h).toContain('raceWeakCap">учить<'); expect(h.indexOf('race-summary-xp')).toBeLessThan(h.indexOf('race-weak'))
    expect(html(RaceSummary, { plan, result, onDone() {} })).not.toContain('race-weak')
    expect(read('../../styles/player/modules/race-summary.css')).toContain("@import './race-weak.css'")
  })
  it('RaceActs: стадия итога — плашка, стадия лестницы — лестница, остальное — ничего; тишина экрана (Пит говорит) скрывает всё', () => {
    const f = o => ({ stage: 'run', stageObj: { type: 'summary' }, rh: { on: true, quiet: false, result: null, race: null }, finish() {}, ...o })
    const cfg = { plan }
    expect(html(RaceActs, { f: f(), cfg })).toContain('race-summary')
    expect(html(RaceActs, { f: f({ stageObj: { type: 'student', act: 'climb', sid: 'climb-1' }, rh: { on: true, quiet: false, race: { climb: initClimb(4) } } }), cfg })).toContain('race-climb')
    expect(html(RaceActs, { f: f({ stageObj: { type: 'student', act: 'sprint' } }), cfg })).toBe('')
    expect(html(RaceActs, { f: f({ rh: { on: true, quiet: true } }), cfg })).toBe('')
    expect(html(RaceActs, { f: f({ stage: 'paused' }), cfg })).toBe('')
  })
  it('RehearsalActs отдаёт гонке экран, когда у плана game = race; репетиция рисуется как раньше', () => {
    const f = { stage: 'run', stageObj: { type: 'summary' }, rh: { on: true, quiet: false, result: null, tag: '' }, finish() {}, next() {} }
    expect(html(RehearsalActs, { f, cfg: { plan } })).toContain('race-summary')
    expect(html(RehearsalActs, { f, cfg: { plan: normalizePlan(fixturePlan('three')) } })).toContain('rh-summary')
  })
})

describe('админка: блок «Гонка с Питом (стенд)» и инструкция', () => {
  it('блок: фикстура, статус реплик race_*, куски, тап, «Полная гонка» и четыре раунда, «Скачать отладку», «Как тестировать»', () => {
    const h = html(RaceBlock, {})
    expect(h).toContain('Гонка с Питом (стенд)')
    for (const id of ['race-fixture', 'race-lines-status', 'race-voice-lines', 'race-chunks-status', 'race-voice-chunks', 'race-tap-mode', 'race-run-full', 'race-run-sprint', 'race-run-catch', 'race-run-climb', 'race-run-descent', 'race-export', 'race-howto']) expect(h).toContain(`data-testid="${id}"`)
    for (const t of ['Полная гонка', 'Разгон', 'Слушай и лови', 'Вершина', 'Спуск', 'Скачать отладку', 'Тап вместо речи']) expect(h).toContain(t)
    expect(h).toContain('Реплики Пита race_*')
  })
  it('блок стоит в «Голос» над «Мини-игрой 2.0» и запускает игру нодой с game: race и round', () => {
    const tab = read('../admin/speech/AdminSpeechTab.jsx')
    expect(tab.indexOf('<RaceBlock />')).toBeGreaterThan(0); expect(tab.indexOf('<RaceBlock />')).toBeLessThan(tab.indexOf('<Game2Block />'))
    const src = read('../admin/speech/RaceBlock.jsx')
    expect(src).toContain("game: 'race', round: round ?? undefined"); expect(src).toContain('bare forceDebug startRef={startRef}'); expect(src).toContain('list: RACE_LINES')
  })
  it('«Как тестировать»: восемь шагов, раздел сворачиваемый; тот же текст лежит в CONCEPT_RACE.md слово в слово', () => {
    const h = html(RaceHowto, {})
    expect(h).toContain('<details class="g2Howto" open=""'); expect(h).toContain(HOWTO_TITLE)
    expect(HOWTO_STEPS).toHaveLength(8)
    const md = read('../../../CONCEPT_RACE.md')
    expect(md).toContain('## Как тестировать')
    for (const s of HOWTO_STEPS) expect(md).toContain(s)
    expect(howtoMarkdown()).toContain(HOWTO_STEPS[3])
    const all = HOWTO_STEPS.join(' ') // проверки доработок: слово до пилюль, общий таймер и +5 с, острова зигзагом, сальто, время вышло
    for (const t of ['сначала Пит произносит слово', 'старт 12 секунд', '+5 секунд', 'зигзагом', 'сальто', 'время вышло']) expect(all).toContain(t)
    expect(md.split('\n').length).toBeLessThanOrEqual(150)
  })
  it('«Скачать отладку»: файл с журналом плеера и отдельным полем строк [race]', () => {
    const f = raceDebugFile({ now: new Date('2026-11-03T10:00:00Z'), lines: ['[warm] x', '[race] разгон: «learn» верно, серия 1'] })
    const j = JSON.parse(f.json)
    expect(f.name).toMatch(/^pithy-race-debug-/); expect(j.kind).toBe('race-debug'); expect(j.race).toEqual(['[race] разгон: «learn» верно, серия 1']); expect(j.lines).toHaveLength(2)
  })
})
