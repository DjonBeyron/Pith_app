import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RehearsalActs from './RehearsalActs.jsx'
import RehearsalSummary from './RehearsalSummary.jsx'
import RehearsalMirrorStub from './RehearsalMirrorStub.jsx'
import { useRehearsalActs, STUCK_MS, LINE_AT_MS } from './useRehearsalActs.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { createJournal, record } from './rehearsalJournal.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = fixturePlan('three')
const cfg = { plan, translation: plan.translation }
const html = (el, props) => renderToStaticMarkup(createElement(el, props))
const baseF = (o = {}) => ({ stage: 'run', phase: 'student', pausedIntro: false, stageObj: { type: 'student' }, rh: { on: true, tag: '', result: null }, next() {}, finish() {}, ...o })

describe('интерфейс актов', () => {
  it('не репетиция (rh.on = false) — ничего не рисует', () => {
    expect(html(RehearsalActs, { f: baseF({ rh: { on: false } }), cfg })).toBe('')
    expect(html(RehearsalActs, { f: { rh: null }, cfg })).toBe('')
  })
  it('заставка: перевод фразы под падающей фразой; в акте — нет', () => {
    const intro = html(RehearsalActs, { f: baseF({ stage: 'drop', phase: 'drop', stageObj: null }), cfg })
    expect(intro).toContain('data-testid="rh-translation"'); expect(intro).toContain('Я пытаюсь научиться')
    expect(html(RehearsalActs, { f: baseF(), cfg })).not.toContain('rh-translation')
  })
  it('ярлык-плашка «Чётко — для последнего ряда» — одна строка над дорожками, не на пилюле', () => {
    const out = html(RehearsalActs, { f: baseF({ rh: { on: true, tag: 'Чётко — для последнего ряда' } }), cfg })
    expect(out).toContain('class="rhTag"'); expect(out).toContain('Чётко — для последнего ряда')
    const css = read('../../styles/player/modules/rehearsal.css')
    expect(css).toMatch(/\.rhTag \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/)
    expect(css).toMatch(/\.rhTag \{[^}]*max-width: calc\(100% - 32px\)/)
  })
  it('зеркало — заглушка «Зеркало — скоро» с кнопкой «Дальше»', () => {
    const out = html(RehearsalActs, { f: baseF({ stageObj: { type: 'mirror' }, phase: 'mirror' }), cfg })
    expect(out).toContain('data-testid="rh-mirror"'); expect(out).toContain('Зеркало — скоро'); expect(out).toContain('data-testid="rh-mirror-next"')
    expect(html(RehearsalMirrorStub, { onNext() {} })).toContain('Дальше')
  })
  it('итог: фраза, перевод, темп «—», заметка «—», XP, «Ещё минутку?» и «Готово»', () => {
    const out = html(RehearsalActs, { f: baseF({ stageObj: { type: 'summary' }, phase: 'summary', rh: { on: true, tag: '', result: { xp: 2, capped: false } } }), cfg, onAgain() {} })
    expect(out).toContain("I&#x27;m trying to learn"); expect(out).toContain('Я пытаюсь научиться')
    expect(out).toMatch(/rh-summary-tempo">—</); expect(out).toMatch(/rh-summary-note">—</); expect(out).toMatch(/rh-summary-xp">\+2</)
    expect(out).toContain('Ещё минутку?'); expect(out).toContain('Готово')
  })
  it('итог: нет следующего плана — «Ещё минутку?» нет; XP ещё не посчитан — «…»; потолок дня подписан', () => {
    const none = html(RehearsalSummary, { plan, result: null, onDone() {} })
    expect(none).not.toContain('rh-again'); expect(none).toMatch(/rh-summary-xp">…</)
    expect(html(RehearsalSummary, { plan, result: { xp: 0, capped: true }, onAgain() {}, onDone() {} })).toContain('+0 (потолок дня)')
  })
  it('пауза или стадия вне run: экраны зеркала и итога не показываются', () => {
    expect(html(RehearsalActs, { f: baseF({ stage: 'paused', stageObj: { type: 'summary' } }), cfg })).not.toContain('rh-summary')
  })
})

// Хук актов без React-рантайма: функции, которые директор зовёт в обработчиках (эффекты на сервере не идут)
function probe(over = {}) {
  const out = {}
  const stages = buildRehearsalStages({ plan, rate: 1, lib: () => null }).stages
  const say = vi.fn()
  function P() {
    Object.assign(out, useRehearsalActs({ plan, stages, stage: 'run', at: 0, stageObj: stages[1], setS() {}, sayLine: say, sayText() {}, cat: { busyLeft: () => 0 }, lines: normalizeLines(null), rate: 1, listenerRef: { current: null }, ...over }))
    return null
  }
  renderToStaticMarkup(createElement(P))
  return { rh: out, stages, say }
}

describe('useRehearsalActs', () => {
  it('rec пишет в журнал по стадии; первый промах разминки — реплика «Это слово и будем тренировать»', () => {
    const { rh, say } = probe()
    rh.rec('win'); rh.rec('miss'); rh.rec('miss'); rh.rec('fail')
    expect(rh.journal.stages['warmup-0']).toMatchObject({ win: 1, miss: 2, fail: 1 })
    expect(say.mock.calls.filter(c => c[0] === 'rh_warmup_miss')).toHaveLength(1)
  })
  it('failLine: в разминке — «это слово и будем тренировать», в остальных актах — обычные реплики игры (null)', () => {
    const { rh, stages } = probe()
    expect(rh.failLine(stages.find(s => s.act === 'warmup' && s.type === 'warmup'))).toBe('rh_warmup_miss')
    expect(rh.failLine(stages.find(s => s.sid === 'build-0'))).toBeNull()
  })
  it('nextIdx идёт мимо пропущенных ступеней (повтор — только после промаха); holdMs держит плашку, пока Пит говорит', () => {
    const { rh, stages } = probe()
    const i = stages.find(s => s.sid === 'build-0').idx
    expect(rh.nextIdx(i + 1)).toBe(stages.find(s => s.sid === 'build-1-d').idx)
    record(rh.journal, stages[i], 'fail')
    expect(rh.nextIdx(i + 1)).toBe(i + 1)
    const ann = stages.find(s => s.sid === 'warmup-ann')
    expect(rh.holdMs(ann)).toBeGreaterThan(ann.ms)
    expect(rh.holdMs(stages.find(s => s.type === 'turn'))).toBe(1500)
    expect(rh.holdMs({ ms: 900, line: 'rh_clear' })).toBeGreaterThan(900)
  })
  it('пока Пит занят прошлой репликой, плашка ждёт её конца', () => {
    const free = probe().rh.holdMs({ ms: 100, line: 'rh_clear' })
    const busy = probe({ cat: { busyLeft: () => 2000 } }).rh.holdMs({ ms: 100, line: 'rh_clear' })
    expect(busy - free).toBe(2000)
  })
  it('слабые слова разминки (два промаха) — в «без текста» у них подпись; в других ступенях подсказок нет', () => {
    const { rh, stages } = probe()
    const w = stages.find(s => s.sid === 'warmup-1')
    record(rh.journal, w, 'fail'); record(rh.journal, w, 'miss')
    expect(rh.hintLanes(stages.find(s => s.sid === 'blind-0'))).toEqual([2])
    expect(rh.hintLanes(stages.find(s => s.sid === 'build-1'))).toEqual([])
  })
  it('без плана (обычная нода): ни журнала подсказок, ни пропусков — всё как раньше', () => {
    const { rh } = probe({ plan: null, stageObj: { type: 'student', ms: 700 } })
    expect(rh.on).toBe(false); expect(rh.nextIdx(5)).toBe(5); expect(rh.holdMs({ ms: 1700, line: 'rh_clear' })).toBe(1700); expect(rh.tag).toBe(''); expect(rh.hintLanes({ act: 'blind', type: 'student' })).toEqual([])
    expect(createJournal().stages).toEqual({})
  })
  it('константы: «застрял» — 3 с, реплика стадии — чуть позже плашки', () => {
    expect(STUCK_MS).toBe(3000); expect(LINE_AT_MS).toBe(250)
  })
})
