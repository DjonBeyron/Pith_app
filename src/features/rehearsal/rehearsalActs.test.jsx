import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import RehearsalActs from './RehearsalActs.jsx'
import RehearsalSummary from './RehearsalSummary.jsx'
import { useRehearsalActs, STUCK_MS, LINE_AT_MS } from './useRehearsalActs.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { createJournal, record } from './rehearsalJournal.js'
import { normalizeLines } from '../player/modules/rotate-phone/wordLaneCatLines.js'
import { buildMirror, tempoLabel } from './rehearsalMirror.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN } from './mirror/mirrorFixtures.js'
import { noteFor } from './mirror/mirrorNotes.js'
import { baseLineId, lineVariants } from './rehearsalLines.js'
import { sessionLogLine } from './rehearsalVariety.js'
import { buildActs } from './rehearsalRecipe.js'
import { countdownMs } from './rehearsalCountdown.js'

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = { ...fixturePlan('three'), seed: 'd' } // семя 'd': разминка начинается со слова learn (sid warmup-1)
const cfg = { plan, translation: plan.translation }
const html = (el, props) => renderToStaticMarkup(createElement(el, props))
const baseF = (o = {}) => ({ stage: 'run', phase: 'student', pausedIntro: false, stageObj: { type: 'student' }, rh: { on: true, tag: '', result: null }, next() {}, finish() {}, ...o })

describe('интерфейс актов', () => {
  it('не репетиция (rh.on = false) — ничего не рисует', () => {
    expect(html(RehearsalActs, { f: baseF({ rh: { on: false } }), cfg })).toBe('')
    expect(html(RehearsalActs, { f: { rh: null }, cfg })).toBe('')
  })
  it('заставка: сверху ни фразы, ни перевода (v3.3.84) — только дорожки; в акте перевода тоже нет', () => {
    const intro = html(RehearsalActs, { f: baseF({ stage: 'drop', phase: 'drop', stageObj: null }), cfg })
    expect(intro).not.toContain('rh-translation'); expect(intro).not.toContain('Я пытаюсь научиться')
    expect(html(RehearsalActs, { f: baseF(), cfg })).not.toContain('rh-translation')
    const game = read('../player/modules/rotate-phone/WordLaneGame.jsx')
    expect(game).toContain("const heads = intro && !cfg.plan ? cfg.chunks.map(text => ({ text, on: true })) : intro ? f.labels.map(() => ({ text: '', on: false })) : f.labels") // репетиция: подписи пустые на заставке; обычная нода — как раньше
  })
  it('пока Пит договаривает реплику (rh.quiet), ярлык, зеркало и итог не показываются — только дорожки и кот', () => {
    const tag = { on: true, tag: 'Чётко — для последнего ряда', result: null, mirror: null }
    expect(html(RehearsalActs, { f: baseF({ rh: { ...tag, quiet: false } }), cfg })).toContain('rhTag')
    expect(html(RehearsalActs, { f: baseF({ rh: { ...tag, quiet: true } }), cfg })).toBe('')
    expect(html(RehearsalActs, { f: baseF({ stageObj: { type: 'summary' }, rh: { ...tag, tag: '', quiet: true } }), cfg })).toBe('')
    expect(html(RehearsalActs, { f: baseF({ stageObj: { type: 'summary' }, rh: { ...tag, tag: '', quiet: false } }), cfg })).toContain('rh-summary')
  })
  it('ярлык-плашка «Чётко — для последнего ряда» — одна строка над дорожками, не на пилюле', () => {
    const out = html(RehearsalActs, { f: baseF({ rh: { on: true, tag: 'Чётко — для последнего ряда' } }), cfg })
    expect(out).toContain('class="rhTag"'); expect(out).toContain('Чётко — для последнего ряда')
    const css = read('../../styles/player/modules/rehearsal.css')
    expect(css).toMatch(/\.rhTag \{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/)
    expect(css).toMatch(/\.rhTag \{[^}]*max-width: calc\(100% - 32px\)/)
  })
  it('зеркало: экран сравнения «Пит / Ты» (WordLaneMirror) на весь экран вместо заглушки, заметка Пита, «Сравнить» и «Дальше»', () => {
    const dictor = { ...DICTOR, leadMs: 0, play() {}, cancel() {} }
    const words = STUDENT_CLEAN.words.map(w => ({ ...w, start: w.start * 1000, end: w.end * 1000 }))
    const mirror = buildMirror({ chunks: CHUNKS, take: { url: 'blob:take', durationMs: 2600, rms: 0.09 }, words, dictor })
    const out = html(RehearsalActs, { f: baseF({ stageObj: { type: 'mirror' }, phase: 'mirror', rh: { on: true, tag: '', result: null, mirror } }), cfg })
    expect(out).toContain('class="rhScreen rhMirror"'); expect(out).toContain('data-testid="rh-mirror"'); expect(out).toContain('data-testid="wl-mirror"')
    expect(out).toContain('<b>Пит</b>'); expect(out).toContain('<b>Ты</b>'); expect(out).toContain('data-testid="wl-mirror-compare"'); expect(out).toContain('>Сравнить<'); expect(out).toContain('data-testid="wl-mirror-done"')
    expect(out).toContain('Порядок верный, темп мой. Чисто.'); expect(out).toContain('<audio src="blob:take"')
    expect(out).not.toContain('Зеркало — скоро'); expect(out).not.toContain('rh-mirror-next')
  })
  it('зеркало без записи (сбой): полоса Пита, «Послушать», заметка о сбое; без данных зеркала экран не рисуется', () => {
    const mirror = { dictor: { ...DICTOR, leadMs: 0, play() {} }, student: null, measure: null, note: noteFor(null), tempo: null }
    const out = html(RehearsalActs, { f: baseF({ stageObj: { type: 'mirror' }, phase: 'mirror', rh: { on: true, tag: '', result: null, mirror } }), cfg })
    expect(out).toContain('data-fail="true"'); expect(out).not.toContain('<b>Ты</b>'); expect(out).toContain('>Послушать<'); expect(out).toContain('Запись не получилась')
    expect(html(RehearsalActs, { f: baseF({ stageObj: { type: 'mirror' }, phase: 'mirror' }), cfg })).not.toContain('rh-mirror')
  })
  it('итог: фраза, перевод, темп, заметка Пита, XP, «Ещё минутку?» и «Готово»', () => {
    const result = { xp: 2, capped: false, tempo: 1.3, note: { key: 'tempo', text: 'Ты медленнее меня на 30 %.' } }
    const out = html(RehearsalActs, { f: baseF({ stageObj: { type: 'summary' }, phase: 'summary', rh: { on: true, tag: '', result } }), cfg, onAgain() {} })
    expect(out).toContain("I&#x27;m trying to learn"); expect(out).toContain('Я пытаюсь научиться')
    expect(out).toMatch(/rh-summary-tempo">×1\.3</); expect(out).toContain('rh-summary-note">Ты медленнее меня на 30 %.<'); expect(out).toMatch(/rh-summary-xp">\+2</)
    expect(out).toContain('Ещё минутку?'); expect(out).toContain('Готово')
  })
  it('итог: записи нет — темп «—», заметка о сбое; XP ещё не посчитан — «…», темп и заметка «—»', () => {
    const fail = html(RehearsalSummary, { plan, result: { xp: 1, capped: false, tempo: null, note: noteFor(null) }, onDone() {} })
    expect(fail).toMatch(/rh-summary-tempo">—</); expect(fail).toContain('Запись не получилась')
    const wait = html(RehearsalSummary, { plan, result: null, onDone() {} })
    expect(wait).toMatch(/rh-summary-tempo">—</); expect(wait).toMatch(/rh-summary-note">—</)
  })
  it('темп: ×1.3 — медленнее Пита; «как у Пита» при |1 − темп| < 0,1; ×0.8 — быстрее; нет записи — «—»', () => {
    expect(tempoLabel(1.3)).toBe('×1.3'); expect(tempoLabel(0.8)).toBe('×0.8'); expect(tempoLabel(2)).toBe('×2.0')
    expect(tempoLabel(1)).toBe('как у Пита'); expect(tempoLabel(1.09)).toBe('как у Пита'); expect(tempoLabel(0.92)).toBe('как у Пита')
    expect(tempoLabel(1.1)).toBe('×1.1'); expect(tempoLabel(0.9)).toBe('×0.9')
    expect(tempoLabel(null)).toBe('—'); expect(tempoLabel(undefined)).toBe('—'); expect(tempoLabel(0)).toBe('—')
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
    expect(rh.journal.stages['warmup-1']).toMatchObject({ win: 1, miss: 2, fail: 1 })
    expect(say.mock.calls.filter(c => baseLineId(c[0]) === 'rh_warmup_miss')).toHaveLength(1)
  })
  it('failLine: в разминке — «это слово и будем тренировать», в остальных актах — обычные реплики игры (null)', () => {
    const { rh, stages } = probe()
    expect(baseLineId(rh.failLine(stages.find(s => s.act === 'warmup' && s.type === 'warmup')))).toBe('rh_warmup_miss')
    expect(rh.failLine(stages.find(s => s.sid === 'build-0'))).toBeNull()
  })
  it('«Опа, кажется, слово немного забылось»: один текст (решение владельца), всегда rh_warmup_miss', () => {
    const { rh, stages } = probe()
    const w = stages.find(s => s.act === 'warmup' && s.type === 'warmup')
    expect(Array.from({ length: 10 }, () => rh.failLine(w))).toEqual(Array(10).fill('rh_warmup_miss')); expect(lineVariants('rh_warmup_miss')).toEqual(['rh_warmup_miss'])
  })
  it('строка журнала старта: семя и что выбрано в каждом акте; вступление и итог берут вариант по номеру запуска (plan.run)', () => {
    const line = sessionLogLine(plan, buildActs(plan, { only: null }).acts)
    expect(line).toBe("[rehearsal] seed=d варианты: разминка learn@1 > trying@0 > to@2 > I'm@0, читка rh_read_why, сборка чётко > обычно, без текста слово > перевод, различи learn lean+earn→2, lean+earn→0")
    const src = read('./useRehearsalActs.js')
    expect(src).toContain("sessionLine(plan, 'rh_start')"); expect(src).toContain("sessionLine(plan, 'rh_done')"); expect(src).toContain('pLog(sessionLogLine(')
  })
  it('«застрял»: подсказки по порядку ступени (какая первая — по семени), перевод — подписью без речи', () => {
    const { stages } = probe()
    const b0 = stages.find(s => s.sid === 'blind-0'), b1 = stages.find(s => s.sid === 'blind-1')
    expect([b0.hintKinds, b1.hintKinds]).toEqual([['word', 'tr'], ['tr', 'word']])
    expect(read('./useRehearsalActs.js')).toContain("if (h.kind === 'word') wordTimer = sayWordHint({ word: h.word, lines, rate, sayLine, sayText })")
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
  it('плашка со счётом: «давай разомнёмся» → три ноты → слово (after); «Дубль» → три ноты → «поехали» (before); holdMs включает отсчёт', () => {
    const { rh, stages } = probe()
    const warm = stages.find(s => s.sid === 'warmup-ann'), take = stages.find(s => s.sid === 'take-ann')
    expect([warm.count, take.count]).toEqual(['after', 'before'])
    const lineOnly = rh.holdMs({ ...warm, count: undefined })
    expect(rh.holdMs(warm)).toBe(lineOnly + countdownMs() + 20) // реплика на 20 мс позже, чем без счёта: отсчёт стартует от её конца
    expect(rh.holdMs(take)).toBeGreaterThanOrEqual(LINE_AT_MS + countdownMs() + 600 + 7 * 65) // нет озвучки: «поехали» по оценке 65 мс на знак
    expect(rh.holdMs({ ms: 1700, count: 'before' })).toBe(Math.max(1700, LINE_AT_MS + countdownMs())) // счёт без реплики
    expect(probe({ cat: { busyLeft: () => 2000 } }).rh.holdMs(warm) - rh.holdMs(warm)).toBe(2000) // Пит ещё договаривает прошлую реплику — отсчёт ждёт
  })
  it('отсчёт и «Начни с» подключены в директоре: ноты греются заранее, стартуют, когда Пит договорил, стадия ждёт их конца, таймеры гасятся со сменой стадии', () => {
    const src = read('./useRehearsalActs.js')
    expect(src).toContain('warmCountdown(); return releaseCountdown'); expect(src).toContain('stopCount = scheduleStageCount({ countAt: t.countAt, busyLeft: () => cat.busyLeft(), gate })')
    expect(src).toContain('return () => { ids.forEach(clearTimeout); stopCount?.() }'); expect(src).toContain('afterCount: fn => gate.after(fn)')
    expect(src).not.toContain('startCountdown')
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
  it('дубль и зеркало: leave сразу отпускает все стадии, кроме take (на ней нет записи — тоже сразу); зеркало вне стадии mirror не готовится', () => {
    const { rh, stages } = probe()
    const go = vi.fn()
    rh.leave(stages.find(s => s.type === 'student'), go); rh.leave(stages.find(s => s.type === 'take'), go); rh.leave(undefined, go)
    expect(go).toHaveBeenCalledTimes(3)
    expect(rh.mirror).toBeNull()
  })
  it('стадия mirror без дубля (take обошли): экран зеркала всё равно есть — диктор и заметка о сбое', () => {
    const { rh, stages } = probe({ stageObj: undefined })
    expect(rh.mirror).toBeNull()
    const m = probe({ stageObj: stages.find(s => s.type === 'mirror') }).rh.mirror
    expect(m.student).toBeNull(); expect(m.measure).toBeNull(); expect(m.note.key).toBe('fail'); expect(m.dictor.words.length).toBeGreaterThan(0)
  })
  it('без плана: leave тоже сразу go, зеркала нет', () => {
    const go = vi.fn(); const { rh } = probe({ plan: null, stageObj: { type: 'take' } })
    rh.leave({ type: 'take' }, go); expect(go).toHaveBeenCalledTimes(1); expect(rh.mirror).toBeNull()
  })
  it('константы: «застрял» — 3 с, реплика стадии — чуть позже плашки', () => {
    expect(STUCK_MS).toBe(3000); expect(LINE_AT_MS).toBe(250)
  })
})
