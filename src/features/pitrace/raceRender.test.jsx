import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RaceClimb from './RaceClimb.jsx'
import RaceSummary from './RaceSummary.jsx'
import RaceActs from './RaceActs.jsx'
import RaceHowto from './RaceHowto.jsx'
import RaceBlock from '../admin/speech/RaceBlock.jsx'
import RehearsalActs from '../rehearsal/RehearsalActs.jsx'
import { initClimb, apply, enter } from './raceLadder.js'
import { HOWTO_STEPS, HOWTO_TITLE, howtoMarkdown } from './raceHowto.js'
import { climbWords } from './raceWords.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { raceDebugFile } from './raceLog.js'

vi.mock('../../shared/lib/vosk/useVoskReady.js', () => ({ useVoskReady: () => ({ status: 'preparing', download() {}, retry() {} }) })) // фоновая загрузка Vosk не рендерится на сервере
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), game: 'race' })
const words = climbWords(plan)
const html = (el, props) => renderToStaticMarkup(createElement(el, props))
const esc = t => t.replace(/'/g, '&#x27;') // апостроф в разметке сервера экранируется
const climbAt = events => events.reduce((c, e) => apply(enter(c), e).climb, initClimb(words.length))

describe('лестница «Вершины» (RaceClimb)', () => {
  it('N ступеней, на каждой номер, подписи скрыты; сверху «вершина»; альпинист на земле; полоска времени на первой ступени', () => {
    const h = html(RaceClimb, { climb: initClimb(4), words, phrase: plan.chunks.join(' ') })
    for (let k = 1; k <= 4; k++) expect(h).toContain(`data-testid="race-step-${k}"`)
    expect(h).not.toContain('data-testid="race-step-5"')
    expect(h).toContain('data-testid="race-summit"')
    for (const w of words) expect(h).not.toContain(`>${w}</span>`) // слов на ступенях нет — виден только номер
    expect(h).toContain('data-testid="race-bar"'); expect(h).toMatch(/data-target="1"[^>]*data-testid="race-step-1"|data-testid="race-step-1"/)
    expect(h).toContain('--cam:0')
  })
  it('попал: подпись взятой ступени проявляется, альпинист выше, «камера» сдвигается со второй ступени', () => {
    const c = climbAt(['win', 'win'])
    const h = html(RaceClimb, { climb: c, words, phrase: 'x' })
    expect(h).toContain(`data-testid="race-word-1">${esc(words[0])}</span>`); expect(h).toContain(`data-testid="race-word-2">${words[1]}</span>`)
    expect(h).toContain('data-testid="race-word-3"></span>'); expect(h).toContain('data-last="hit"')
    expect(h).toContain('--cam:1'); expect(html(RaceClimb, { climb: climbAt(['win', 'win', 'win', 'win']), words, phrase: 'x' })).toContain('--cam:3')
  })
  it('соскользнул: подпись оставленной ступени гаснет; промах на третьем заходе — подпись мигает; вершина — золото и плашка', () => {
    const slip = html(RaceClimb, { climb: climbAt(['win', 'win', 'fail']), words, phrase: 'x' })
    expect(slip).toContain('data-last="slip"'); expect(slip).toContain('data-testid="race-word-2"></span>'); expect(slip).toContain(`data-testid="race-word-1">${esc(words[0])}</span>`)
    const blink = html(RaceClimb, { climb: climbAt(['win', 'fail', 'fail', 'fail']), words, phrase: 'x' })
    expect(blink).toContain('data-testid="race-blink"')
    const top = html(RaceClimb, { climb: climbAt(['win', 'win', 'win', 'win']), words, phrase: "I'm trying to learn", final: true })
    expect(top).toContain('data-top="true"'); expect(top).toContain('rhNote wlTurn rhNote--gold'); expect(top).toContain('data-testid="race-top-plate"')
  })
  it('стили лестницы: пилюли и дорожки движка скрыты в раунде, подпись скрыта, анимации выключены на слабом устройстве и reduced-motion, без Math.random', () => {
    const css = read('../../styles/player/modules/race-climb.css')
    expect(css).toContain(".wl[data-act='climb'] .wlField [data-pill]"); expect(css).toContain('visibility: hidden')
    expect(css).toContain('.weak-device .raceClimb'); expect(css).toContain('prefers-reduced-motion: reduce')
    expect(read('../../index.css')).toContain("@import './styles/player/modules/race-climb.css';")
    expect(read('../../index.css')).toContain("@import './styles/player/modules/race-sprint.css';")
  })
})

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
  it('«Как тестировать»: шесть шагов, раздел сворачиваемый; тот же текст лежит в CONCEPT_RACE.md слово в слово', () => {
    const h = html(RaceHowto, {})
    expect(h).toContain('<details class="g2Howto" open=""'); expect(h).toContain(HOWTO_TITLE)
    expect(HOWTO_STEPS).toHaveLength(6)
    const md = read('../../../CONCEPT_RACE.md')
    expect(md).toContain('## Как тестировать')
    for (const s of HOWTO_STEPS) expect(md).toContain(s)
    expect(howtoMarkdown()).toContain(HOWTO_STEPS[3])
    expect(md.split('\n').length).toBeLessThanOrEqual(150)
  })
  it('«Скачать отладку»: файл с журналом плеера и отдельным полем строк [race]', () => {
    const f = raceDebugFile({ now: new Date('2026-11-03T10:00:00Z'), lines: ['[warm] x', '[race] разгон: «learn» верно, серия 1'] })
    const j = JSON.parse(f.json)
    expect(f.name).toMatch(/^pithy-race-debug-/); expect(j.kind).toBe('race-debug'); expect(j.race).toEqual(['[race] разгон: «learn» верно, серия 1']); expect(j.lines).toHaveLength(2)
  })
})
