import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { SCENE_PAUSES, PAUSE_DEFAULTS, setPauseOverrides, resetPauses, pauseMs } from '../../shared/lib/scenePauses.js'
import { sceneTrace } from '../../shared/lib/sceneTrace.js'
import { GOOD_DELAY_MS } from './raceGood.js'
import { createRaceSpeech, AFTER_GOOD_GAP_MS } from './raceSpeech.js'
import { PRE_SAY_GAP_MS, RACE_ANNOUNCE_MS, MIA_INTRO_MS } from './raceStageKit.js'
import { PLATE_HOLD_MS, LEAD_MS, openingPlan } from './raceOpening.js'
import { PHRASE_ENTER_MS, PHRASE_EXIT_MS, PHRASE_LINE_TAIL_MS } from './raceStagesPhrases.js'
import { STAGES_ROUND } from './raceOnly.js'
import { createMiaSpeech, GAP_MS, miaGap } from './mia/miaSpeech.js'
import { BOSS, MIA, bossShift, reduceMia, miaInit } from './mia/raceMia.js'
import { endHoldMs } from './boss/raceEndHold.js'
import { buildRaceStages } from './raceStages.js'
import { raceExit } from './raceStagePauses.js'
import { withPhrases } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { extrasOf } from './raceWords.js'
import { LINE_AT_MS } from '../rehearsal/useRehearsalActs.js'
import { COUNT_TAIL_MS, countdownMs, countdownPlan } from '../rehearsal/rehearsalCountdown.js'
import { fixturePlan } from '../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../rehearsal/rehearsalPlan.js'
import { sceneStage, sceneRun } from '../player/modules/rotate-phone/wordLaneSceneTrace.js'
import { buildTimeline } from '../timeline/timelineModel.js'

// Паузы сценария как настройки (shared/lib/scenePauses.js, CONCEPT_TIMELINE.md «Шаг 2»): значение по умолчанию каждой настройки — прежняя константа кода;
// переопределение доходит до места использования; трасса сцены знает, какая настройка дала паузу; старая модель таймлайна новое событие не замечает.
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')
const plan = (o = {}) => withPhrases(normalizePlan({ ...fixturePlan('three'), source: 'node', game: 'race', ...o }), { phrases: PHRASE_FIXTURE, ...o })
const stagesOf = (o = {}) => buildRaceStages({ plan: plan(), tap: false, ru: true, ...o }).stages
const by = (st, sid) => st.find(s => s.sid === sid)
const knobs = () => sceneTrace.events().filter(e => e.k === 'knob').map(e => { const { t: _t, k: _k, ...r } = e; return r })
beforeEach(() => { resetPauses(); sceneTrace.clear() })

describe('значение по умолчанию каждой настройки — прежняя константа', () => {
  const WAS = {
    'line.at': LINE_AT_MS, 'plate.hold': PLATE_HOLD_MS, 'count.tail': COUNT_TAIL_MS, 'race.announce': RACE_ANNOUNCE_MS, 'good.delay': GOOD_DELAY_MS, 'afterGood.gap': AFTER_GOOD_GAP_MS,
    'preSay.gap': PRE_SAY_GAP_MS, 'stage.exit': Number(read('../player/modules/rotate-phone/useWordLaneFlow.js').match(/const EXIT_PAUSE_MS = (\d+)/)[1]), 'mia.intro': MIA_INTRO_MS, 'mia.gap': GAP_MS,
    'phrase.lineTail': PHRASE_LINE_TAIL_MS, 'phrase.exit': PHRASE_EXIT_MS, 'boss.pit1At': BOSS.PIT1_AT,
  }
  it('реестр и список прежних констант — одни и те же ключи; числа те же, что были до настроек (v3.3.349)', () => {
    expect(Object.keys(WAS).sort()).toEqual(SCENE_PAUSES.map(p => p.key).sort())
    expect(PAUSE_DEFAULTS).toEqual(WAS)
    expect(WAS).toEqual({ 'line.at': 250, 'plate.hold': 1200, 'count.tail': 200, 'race.announce': 1700, 'good.delay': 500, 'afterGood.gap': 350, 'preSay.gap': 450, 'stage.exit': 1300, 'mia.intro': 0, 'mia.gap': 350, 'phrase.lineTail': 230, 'phrase.exit': 300, 'boss.pit1At': 1650 })
    expect(LEAD_MS).toBe(PAUSE_DEFAULTS['line.at']) // заставка считает реплику стадии 0 тем же отступом
  })
  it('каждый ключ, который читает код (pauseMs / knobMs / sceneKnob / knobs), есть в реестре; каждая настройка реестра где-то читается', () => {
    const files = dir => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true }).flatMap(d => (d.isDirectory() ? files(`${dir}${d.name}/`) : /\.(js|jsx)$/.test(d.name) && !/\.test\.js$/.test(d.name) ? [`${dir}${d.name}`] : []))
    const used = new Set()
    for (const f of [...files('./'), ...files('../rehearsal/'), ...files('../player/modules/rotate-phone/')]) for (const m of read(f).matchAll(/(?:pauseMs|knobMs|sceneKnob)\('([^']+)'|knobs?\.\w+ = '([^']+)'|knobs: \{ \w+: '([^']+)'/g)) used.add(m[1] ?? m[2] ?? m[3])
    expect([...used].filter(k => !(k in PAUSE_DEFAULTS))).toEqual([])
    expect(SCENE_PAUSES.map(p => p.key).filter(k => !used.has(k))).toEqual([])
  })
})

describe('переопределение доходит до стадий', () => {
  it('race.announce — минимум плашки этапа; стадии со своим ms (вторые круги, Мия) не трогаются', () => {
    setPauseOverrides({ 'race.announce': 3000 })
    const st = stagesOf()
    for (const sid of ['sprint-ann', 'catch-ann', 'phrases-ann']) { expect(by(st, sid).ms).toBe(3000); expect(by(st, sid).knobs.ms).toBe('race.announce') }
    expect(by(st, 'phrases1-ann').ms).toBe(400); expect(by(st, 'sprint3-ann').ms).toBe(1200); expect(by(st, 'phrases1-ann').knobs?.ms).toBeUndefined()
  })
  it('plate.hold — пауза стадии-заставки и плашки после разворота; расписание заставки (openingPlan) берёт то же значение', () => {
    setPauseOverrides({ 'plate.hold': 2000 })
    const st = stagesOf()
    expect(st[0].pause).toBe(2000); expect(by(st, 'catch-ann').pause).toBe(2000); expect(st[0].knobs.pause).toBe('plate.hold')
    const p = normalizePlan({ ...fixturePlan('three'), game: 'race' }), lines = { race_start: { text: 'Три заезда', url: 'u1', duration: 5 } }
    const o = openingPlan({ ...p, extraWords: extrasOf(p) }, lines); resetPauses()
    const was = openingPlan({ ...p, extraWords: extrasOf(p) }, lines)
    expect(o.pause).toBe(2000); expect(was.pause).toBe(1200); expect(o.countAt - was.countAt).toBe(800)
  })
  it('mia.intro — заставка перед «Допросом» в обоих проходах и перед экзаменом', () => {
    setPauseOverrides({ 'mia.intro': 800 })
    const st = stagesOf()
    for (const sid of ['sprint3-intro-ann', 'catch3-intro-ann', 'boss-intro-ann']) { expect(by(st, sid).ms).toBe(800); expect(by(st, sid).knobs.ms).toBe('mia.intro') }
    expect(by(st, 'sprint-ann').ms).toBe(1700)
  })
  it('phrase.lineTail — хвост плашки «Фраз»; preSay.gap — выдержка ступени, и после пересборки круга (stage.fill) тоже', () => {
    setPauseOverrides({ 'phrase.lineTail': 1000, 'preSay.gap': 900 })
    const st = stagesOf()
    expect(by(st, 'phrases-ann').lineTail).toBe(1000); expect(by(st, 'phrases-ann').knobs.lineTail).toBe('phrase.lineTail')
    expect(by(st, 'sprint').step.preGap).toBe(900)
    const m = by(st, 'sprint3'); m.fill(m.step.reps.slice(0, 2).map((_, i) => plan().words[i]).filter(Boolean).length ? by(st, 'sprint').words ?? [] : [])
    expect(by(st, 'sprint3').step.preGap).toBe(900)
  })
  it('stage.exit / phrase.exit — пауза выхода из стадии (useRaceActs.exitMs → raceExit); выход перед Мией и вход во «Фразы» сразу после круга слов — как были', () => {
    const st = [{ idx: 0, sid: 'sprint', act: 'sprint', type: 'student' }, { idx: 1, sid: 'catch', act: 'catch', type: 'student' }, { idx: 2, sid: 'phrases-ann', act: 'phrases', type: 'announce' }, { idx: 3, sid: 'phrases1', act: 'phrases', type: 'student' }]
    expect([raceExit(st[0], undefined), raceExit(st[1], PHRASE_ENTER_MS), raceExit(st[3], PHRASE_EXIT_MS), raceExit(st[0], MIA.EXIT_MS)]).toEqual([1300, 500, 300, 250])
    setPauseOverrides({ 'stage.exit': 2000, 'phrase.exit': 900 }); sceneTrace.clear()
    expect([raceExit(st[0], undefined), raceExit(st[1], PHRASE_ENTER_MS), raceExit(st[3], PHRASE_EXIT_MS), raceExit(st[0], MIA.EXIT_MS)]).toEqual([2000, 500, 900, 250])
    expect(knobs()).toEqual([{ key: 'stage.exit', ms: 2000, sid: 'sprint', from: 'stage-out', until: 'next-stage', set: true }, { key: 'phrase.exit', ms: 900, sid: 'phrases1', from: 'stage-out', until: 'next-stage', set: true }])
    expect(read('./useRaceActs.js')).toContain('exitMs: st => raceExit(st, ')
    for (const o of [{}, { round: STAGES_ROUND }]) for (const tap of [false, true]) { const all = buildRaceStages({ plan: plan(o), tap, ru: true }).stages; expect(all.filter((s, i) => s.type === 'student' && s.act !== 'phrases' && all[i + 1]?.act === 'phrases')).toEqual([]) } // PHRASE_ENTER_MS в нынешних списках стадий не срабатывает (за кругом слов стоят стадии Мии) — поэтому настройки «вход во Фразы» в реестре нет
  })
  it('count.tail — хвост отсчёта; line.at — отступ реплики стадии у директора (только в гонке)', () => {
    expect(countdownMs(countdownPlan({ soft: true }))).toBe(2500)
    setPauseOverrides({ 'count.tail': 1000 }); expect(countdownMs(countdownPlan({ soft: true }))).toBe(3300); expect(countdownMs(countdownPlan({ soft: true }), 0)).toBe(2300)
    expect(read('../rehearsal/useRehearsalActs.js')).toContain("lead: race ? pauseMs('line.at') : LINE_AT_MS")
  })
})

describe('переопределение доходит до речи', () => {
  function speechRig() {
    let t = 0, seq = 0; const timers = new Map(), h = {}
    const run = ms => { const end = t + ms; for (;;) { const n = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!n) break; timers.delete(n[0]); t = n[1].at; n[1].fn() } t = end }
    const sp = createRaceSpeech({ now: () => t, setTimer: (fn, ms) => { timers.set(++seq, { at: t + ms, fn }); return seq }, clearTimer: id => timers.delete(id), say: { praise: (id, o) => { h.at = t; Object.assign(h, o); return true } } })
    return { sp, run, h, now: () => t }
  }
  const openAt = r => { for (let i = 0; i < 400; i++) { if (r.sp.holdMs() === 0) return r.now(); r.run(10) } return -1 }
  it('good.delay — похвала после взлёта; afterGood.gap — перевод после конца похвалы; в трассе — события knob', () => {
    for (const [over, praiseAt, gap] of [[{}, 500, 350], [{ 'good.delay': 1200, 'afterGood.gap': 800 }, 1200, 800]]) {
      resetPauses(); setPauseOverrides(over); sceneTrace.clear()
      const r = speechRig(); r.sp.claim('race_good_1'); r.sp.riseStart(); r.run(praiseAt - 10); expect(r.h.at).toBeUndefined(); r.run(10); expect(r.h.at).toBe(praiseAt)
      r.h.onSpeak({ ms: 1000 }); r.run(1000); r.h.onEnd(); const end = r.now()
      expect(openAt(r) - end).toBe(gap)
      const set = Object.keys(over).length ? { set: true } : {}
      expect(knobs()).toEqual([{ key: 'good.delay', ms: praiseAt, from: 'rise', until: 'praise', ...set }, { key: 'afterGood.gap', ms: gap, from: 'praise', until: 'say', ...set }])
    }
  })
  it('preSay.gap — перевод после зачёта без похвалы и после «не успел»', () => {
    for (const [over, gap] of [[{}, 450], [{ 'preSay.gap': 1000 }, 1000]]) {
      resetPauses(); setPauseOverrides(over); sceneTrace.clear()
      const a = speechRig(); a.sp.claim(null); a.sp.riseStart(); expect(openAt(a)).toBe(gap)
      const b = speechRig(); b.sp.pillGone('missed'); expect(openAt(b)).toBe(gap)
      expect(knobs().map(k => [k.key, k.ms, k.from])).toEqual([['preSay.gap', gap, 'rise'], ['preSay.gap', gap, 'missed']])
    }
  })
  it('mia.gap — пауза между репликами очереди речи Мии; оценка эпилога (raceEndHold) считает ту же паузу', () => {
    const gapOf = () => {
      let t = 0, id = 0; const timers = new Map(), at = []
      const adv = ms => { const end = t + ms; for (;;) { const n = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!n) break; t = n[1].at; timers.delete(n[0]); n[1].fn() } t = end }
      const sp = createMiaSpeech({ now: () => t, setTimer: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id }, clearTimer: k => timers.delete(k), onSpeak: o => { if (o) at.push({ t, ms: o.ms }) }, trace: () => {} })
      sp.use({ lines: { mia_push: { text: 'Иди сюда', url: null }, mia_announce_1: { text: 'Посиди в коробке', url: null } }, cat: { busyLeft: () => 0, holdBusy: () => {} }, listener: { current: null } })
      sp.enqueue([{ id: 'mia_push', who: 'mia', delay: 0 }, { id: 'mia_announce_1', who: 'mia', delay: 0 }]); adv(20000)
      return at[1].t - at[0].t - at[0].ms
    }
    expect(gapOf()).toBe(350); expect(knobs()).toEqual([{ key: 'mia.gap', ms: 350, from: 'mia_push', until: 'mia_announce_1' }])
    setPauseOverrides({ 'mia.gap': 950 }); expect(gapOf()).toBe(950); expect(miaGap()).toBe(950)
    const hold = () => endHoldMs({ act: 'boss', ms: 99999, mia: 'end' }, { m: miaInit() }, { msOf: () => 3000 })
    const long = hold(); resetPauses(); expect(long - hold()).toBe(1200) // экзамен сдан: две реплики Мии подряд (вот твои трофеи → коробка пригодится) и Пит — две паузы очереди по 600 мс
  })
  it('boss.pit1At — срок первой реплики Пита в экзамене и сдвиг речи Мии за ней', () => {
    const cue = () => reduceMia(miaInit(), { t: 'enter', now: 0, stage: { mia: 'ann', act: 'boss', script: 'boss', sid: 'boss-ann' } }).say.find(c => c.who === 'pit')
    expect(cue()).toMatchObject({ id: 'boss_pit_new', delay: 1650 }); expect(bossShift(1000)).toBe(1650 + 1000 + BOSS.AFTER_PIT_MS - BOSS.HUSH_AT)
    setPauseOverrides({ 'boss.pit1At': 3000 })
    expect(cue().delay).toBe(3000); expect(bossShift(1000)).toBe(3000 + 1000 + BOSS.AFTER_PIT_MS - BOSS.HUSH_AT); expect(by(stagesOf(), 'boss-ann').knobs.pit1).toBe('boss.pit1At')
  })
})

describe('трасса сцены: какая настройка дала паузу', () => {
  it('stage-in несёт pauses — что запеклось в стадию; set — значение не по умолчанию; старт пишет переопределения в мету прохождения', () => {
    setPauseOverrides({ 'race.announce': 3000 })
    const st = stagesOf(); sceneRun(plan(), st); sceneStage(st[0]); sceneStage(by(st, 'sprint'))
    expect(sceneTrace.runs().at(-1).meta.pauses).toBe('race.announce=3000')
    const ins = sceneTrace.events().filter(e => e.k === 'stage-in')
    expect(ins[0].pauses).toEqual([{ key: 'race.announce', ms: 3000, as: 'ms', set: true }, { key: 'plate.hold', ms: 1200, as: 'pause' }, { key: 'line.at', ms: 250, as: 'lead' }])
    expect(ins[1].pauses).toBeUndefined()
    resetPauses(); sceneTrace.clear(); sceneRun(plan(), stagesOf()); expect(sceneTrace.runs().at(-1).meta.pauses).toBeUndefined(); expect(pauseMs('race.announce')).toBe(1700)
  })
  it('модель таймлайна не замечает событие knob и поле pauses: те же дорожки, паузы и стадии, что без них (knob виден только в счётчике видов событий kinds)', () => {
    const base = [{ t: 0, k: 'run', run: 1, game: 'race' }, { t: 10, k: 'stage-in', idx: 0, sid: 'sprint-ann', act: 'sprint', type: 'announce', title: 'Разгон', line: null }, { t: 300, k: 'line-start', who: 'pit', id: 'race_start', text: 'Три заезда', ms: 900 },
      { t: 1200, k: 'line-end', id: 'race_start', played: 900 }, { t: 4000, k: 'stage-in', idx: 1, sid: 'sprint', act: 'sprint', type: 'student', title: '', line: null }, { t: 4100, k: 'pill', idx: 0, word: 'meet', lane: 1 }, { t: 5200, k: 'answer', res: 'win', idx: 0, word: 'meet', final: true }, { t: 9000, k: 'end' }]
    const withKnobs = base.flatMap(e => (e.k === 'stage-in' ? [{ ...e, pauses: [{ key: 'race.announce', ms: 1700, as: 'ms' }] }] : e.k === 'answer' ? [e, { t: e.t + 1, k: 'knob', key: 'good.delay', ms: 500, from: 'rise', until: 'praise' }] : [e]))
    const strip = m => JSON.parse(JSON.stringify(m, (k, v) => (k === 'pauses' || k === 'knob' ? undefined : v)))
    expect(buildTimeline(withKnobs, {}).kinds.knob).toBe(1)
    expect(strip(buildTimeline(withKnobs, { game: 'race', pauses: { 'mia.gap': 500 } }))).toEqual(strip(buildTimeline(base, { game: 'race', pauses: { 'mia.gap': 500 } })))
  })
})
