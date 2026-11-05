import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceSummary from './RaceSummary.jsx'
import RaceActs from './RaceActs.jsx'
import RaceBlock from '../admin/speech/RaceBlock.jsx'
import RehearsalActs from '../rehearsal/RehearsalActs.jsx'
import { initClimb } from './raceLadder.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { raceDebugFile } from './raceLog.js'

vi.mock('../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const html = (el, props) => renderToStaticMarkup(createElement(el, props))

const noBar = h => h.replace(/<div class="raceBar"[\s\S]*?<\/div><\/div>/, '') // постоянный бар сверху (RaceBar) есть всегда, спрятан стилем: в разметке проверяем остальное

describe('итог (RaceSummary) и RaceActs', () => {
  const result = { sprint: { hit: 5, total: 7 }, catchOk: 2, catchTotal: 3, medal: 'silver', descent: 'ok', xp: 2, capped: false, gold: false }
  it('плашка итога: разгон N/M, слух N/3, вершина — медаль, спуск ✓, XP; «Ещё раз» и «Нет»; экран итога на всю сцену', () => {
    const h = html(RaceSummary, { plan, result, onAgain() {}, onDone() {} })
    expect(h).toContain('data-testid="race-summary-sprint">5/7<'); expect(h).toContain('data-testid="race-summary-catch">2/3<')
    expect(h).toContain('>серебро<'); expect(h).toContain('>✓<'); expect(h).toContain('>+2<')
    expect(h).toContain('data-testid="race-again"'); expect(h).toContain('>Ещё раз<'); expect(h).toContain('>Нет<'); expect(h).toContain('wlTurn rhScreen raceFinal'); expect(h).toContain('Встряхни память: итог')
    expect(html(RaceSummary, { plan, result: { ...result, gold: true, medal: 'gold' }, onDone() {} })).toContain('raceSum--gold')
    const one = html(RaceSummary, { plan, result, onDone() {} }); expect(one).not.toContain('race-again'); expect(one).toContain('>Готово<')
    expect(html(RaceSummary, { plan, result: null, onDone() {} })).toContain('…')
  })
  it('итог: список слов от слабых к сильным — строки с цветом по слабости, переводом и пометкой; без слабых слов блока нет', () => {
    const weak = [{ text: 'learn', translation: 'учить', score: 5, tone: 'red', note: 'ошибка' }, { text: 'try', translation: 'пробовать', score: 2, tone: 'yellow', note: 'поздно' }, { text: 'to', translation: '', score: 0, tone: 'green', note: 'верно' }]
    const h = html(RaceSummary, { plan, result: { ...result, weak }, onDone() {} })
    expect(h).toContain('от слабых к сильным'); expect(h).toContain('raceWeakNote" data-testid="race-weak-note">ошибка<'); expect(h.match(/data-testid="race-weak-chip"/g)).toHaveLength(3)
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
    expect(noBar(html(RaceActs, { f: f({ stageObj: { type: 'student', act: 'sprint' } }), cfg }))).toBe('')
    expect(noBar(html(RaceActs, { f: f({ rh: { on: true, quiet: true } }), cfg }))).toBe('')
    expect(noBar(html(RaceActs, { f: f({ stage: 'paused' }), cfg }))).toBe('')
  })
  it('RehearsalActs отдаёт гонке экран, когда у плана game = race; репетиция рисуется как раньше', () => {
    const f = { stage: 'run', stageObj: { type: 'summary' }, rh: { on: true, quiet: false, result: null, tag: '' }, finish() {}, next() {} }
    expect(html(RehearsalActs, { f, cfg: { plan } })).toContain('race-summary')
    expect(html(RehearsalActs, { f, cfg: { plan: normalizePlan(fixturePlan('three')) } })).toContain('rh-summary')
  })
})

describe('админка: блок «Встряхни память (стенд)»', () => {
  const withOpen = (open, fn) => { vi.stubGlobal('localStorage', { getItem: () => (open ? JSON.stringify(['race-settings']) : null), setItem() {} }); try { return fn() } finally { vi.unstubAllGlobals() } }
  it('блок (настройки развёрнуты): фикстура, статус реплик race_*, куски, тап, «Полная гонка» и четыре раунда, «Вспомни на слух + финал», «Скачать отладку»', () => {
    const h = withOpen(true, () => html(RaceBlock, {}))
    expect(h).toContain('Встряхни память (стенд)'); expect(h).toContain('race-ru-address'); expect(h).toContain('race-ru-need') // адрес русской модели и подсказка про тап без неё
    for (const id of ['race-fixture', 'race-lines-status', 'race-voice-lines', 'race-chunks-status', 'race-voice-chunks', 'race-trans-status', 'race-voice-trans', 'race-tap-mode', 'race-run-full', 'race-run-sprint', 'race-run-catch', 'race-run-climb', 'race-run-descent', 'race-run-stages', 'race-export']) expect(h).toContain(`data-testid="${id}"`)
    for (const t of ['Полная гонка', 'Проход A', 'Проход B', 'Вершина', 'Спуск', 'Скачать отладку', 'Тап вместо речи']) expect(h).toContain(t)
    expect(h).toContain('Реплики Пита race_*'); expect(h).not.toContain('race-howto'); expect(h).not.toContain('Как тестировать'); expect(h).not.toContain('race-ask') // плашка-вопрос открывается только по тапу
  })
  it('раскладка на 375 px: первой идёт крупная кнопка «Вспомни на слух + финал», потом «Полная гонка» и раунды, «Настройки» свёрнуты (фикстура, озвучки, тап внутри)', () => {
    const h = withOpen(false, () => html(RaceBlock, {}))
    const at = id => h.indexOf(`data-testid="${id}"`)
    expect(at('race-run-stages')).toBeGreaterThan(0); expect(at('race-run-stages')).toBeLessThan(at('race-run-full')); expect(at('race-run-full')).toBeLessThan(at('race-run-sprint')); expect(at('race-run-sprint')).toBeLessThan(at('race-settings-toggle'))
    expect(h).toContain('aspSay rhpBig'); expect(h).toContain('aria-expanded="false"'); expect(h).toContain('data-testid="race-settings-summary"')
    for (const id of ['race-fixture', 'race-voice-lines', 'race-tap-mode']) expect(h).not.toContain(`data-testid="${id}"`)
  })
  it('блок стоит самым первым во вкладке «Голос» (над «Шлифовкой репетиции») и запускает игру нодой с game: race и round', () => {
    const tab = read('../admin/speech/AdminSpeechTab.jsx')
    expect(tab.indexOf('<RaceBlock />')).toBeGreaterThan(0); expect(tab.indexOf('<RaceBlock />')).toBeLessThan(tab.indexOf('<RehearsalPolishBlock />')); expect(tab.indexOf('<RehearsalPolishBlock />')).toBeLessThan(tab.indexOf('<Game2Block />'))
    const src = read('../admin/speech/RaceBlock.jsx')
    expect(src).toContain("game: 'race', round: round ?? undefined"); expect(src).toContain('bare forceDebug startRef={startRef}'); expect(src).toContain('list: RACE_LINES')
  })
  it('«Скачать отладку»: файл с журналом плеера и отдельным полем строк [race]', () => {
    const f = raceDebugFile({ now: new Date('2026-11-03T10:00:00Z'), lines: ['[warm] x', '[race] разгон: «learn» верно, серия 1'] })
    const j = JSON.parse(f.json)
    expect(f.name).toMatch(/^pithy-race-debug-/); expect(j.kind).toBe('race-debug'); expect(j.race).toEqual(['[race] разгон: «learn» верно, серия 1']); expect(j.lines).toHaveLength(2)
  })
})
