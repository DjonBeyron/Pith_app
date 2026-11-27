import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { sceneTrace } from '../../../../shared/lib/sceneTrace.js'
import { sceneRun, sceneStage, sceneStageOut, sceneAsk, scenePill, sceneClaim, sceneAnswer } from './wordLaneSceneTrace.js'
import { catDebug } from './wordLaneCatDebug.js'
import { createMiaSpeech } from '../../../pitrace/mia/miaSpeech.js'
import { buildTimeline } from '../../../timeline/timelineModel.js'

const last = () => { const e = sceneTrace.events().at(-1); const { t: _t, ...rest } = e; return rest }
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('запись игры в трассу сцены (wordLaneSceneTrace)', () => {
  beforeEach(() => sceneTrace.clear())

  it('старт прохождения и вход / выход стадии', () => {
    sceneRun({ game: 'race', round: 'stages', seed: 'r1' }, [{ step: {} }, { step: { tapOnly: true } }])
    expect(sceneTrace.runs()[0].meta).toEqual({ game: 'race', only: 'stages', seed: 'r1', stages: 2, ask: 'mixed' })
    sceneStage({ idx: 3, sid: 'sprint-ann', act: 'sprint', type: 'announce', round: { title: 'Конвейер слов' }, line: 'race_sprint_go' })
    expect(last()).toEqual({ k: 'stage-in', idx: 3, sid: 'sprint-ann', act: 'sprint', type: 'announce', title: 'Конвейер слов', line: 'race_sprint_go' })
    sceneStageOut({ idx: 3, sid: 'sprint-ann' }); expect(last()).toEqual({ k: 'stage-out', idx: 3, sid: 'sprint-ann' })
  })

  it('пилюля, принятие слова и исходы: промах слова не закрывает ход, «не успел» и взлёт — закрывают', () => {
    const rep = { idx: 2, text: 'see', cap: 'видеть', lanes: [1], speed: 1.1 }
    sceneAsk({ rep }); expect(last()).toEqual({ k: 'ask', idx: 2, word: 'видеть' })
    scenePill({ rep }); expect(last()).toEqual({ k: 'pill', idx: 2, word: 'видеть', lane: 1, speed: 1.1 })
    sceneClaim({ rep, ms: 1234 }); expect(last()).toEqual({ k: 'claim', idx: 2, ms: 1234 })
    sceneAnswer('miss', rep); expect(last()).toMatchObject({ k: 'answer', res: 'miss', final: false })
    sceneAnswer('win', { last: false, count: 2, idx: 2 }); expect(last().final).toBe(false)
    sceneAnswer('win', { last: true, count: 1, idx: 2 }); expect(last()).toMatchObject({ res: 'win', idx: 2, final: true })
    sceneAnswer('fail', rep); expect(last()).toMatchObject({ res: 'fail', word: 'видеть', final: true })
  })

  it('этап «Фразы»: ход начинается на pre, итог хода (rep.res) окончателен и при ошибке', () => {
    const rep = { idx: 0, round: 1, mode: 'pick', text: 'See you later', target: { text: 'See you later' }, res: { ok: false } }
    sceneAsk({ rep }); expect(last()).toEqual({ k: 'ask', idx: 0, word: 'See you later', phrase: true, mode: 'pick' })
    sceneAnswer('miss', rep); expect(last()).toMatchObject({ res: 'miss', final: true })
    sceneAnswer('win', { last: true, count: 1, ...rep, res: { ok: true, late: true } }); expect(last()).toMatchObject({ res: 'win', late: true })
  })

  it('ни одна запись не бросает на мусоре и ничего не возвращает игре', () => {
    for (const f of [sceneRun, sceneStage, sceneStageOut, sceneAsk, scenePill, sceneClaim, sceneAnswer]) { expect(() => f(undefined, undefined)).not.toThrow(); expect(() => f(null, null)).not.toThrow(); expect(f({}, {})).toBeUndefined() }
  })

  it('журнал рта Пита (catDebug) пишет начало и конец реплики; текст реплики — из подсказки директора реплик', () => {
    sceneTrace.begin({}); sceneTrace.hint('race_good_2', 'звучит очень хорошо')
    catDebug('cat-speak', { id: 'race_good_2', ms: 1500, trackLen: 9, empty: false, up: true }); expect(last()).toEqual({ k: 'line-start', who: 'pit', id: 'race_good_2', text: 'звучит очень хорошо', ms: 1500 })
    catDebug('cat-speak-end', { id: 'race_good_2', ms: 1500, played: 1502, shapes: 9, micBlocked: 0, why: 'done' }); expect(last()).toEqual({ k: 'line-end', id: 'race_good_2', played: 1502, why: 'done' })
    catDebug('cat-speak', { id: 'встречать', ms: 600 }); expect(last()).toMatchObject({ who: 'dictor', text: 'встречать' })
    catDebug('cat-line-silent', { id: 'race_catch', reason: 'no-url' }); expect(last()).toEqual({ k: 'line-silent', id: 'race_catch', reason: 'no-url' })
    const n = sceneTrace.events().length; catDebug('cat-voice', { id: 'x' }, { quiet: true }); expect(sceneTrace.events().length).toBe(n)
  })

  it('речь Мии: начало и конец реплики в трассе, из событий строится дорожка Мии', () => {
    sceneTrace.begin({})
    let now = 0; const timers = []
    const sp = createMiaSpeech({ now: () => now, setTimer: (f, ms) => { timers.push({ f, at: now + ms }); return timers.length }, clearTimer: () => {} })
    sp.use({ lines: { mia_test: { text: 'Так, так' } }, cat: { busyLeft: () => 0, holdBusy: () => {} } })
    sp.enqueue([{ id: 'mia_test', who: 'mia', delay: 0 }])
    const start = sceneTrace.events().find(e => e.k === 'line-start'); expect(start).toMatchObject({ who: 'mia', id: 'mia_test', text: 'Так, так', silent: true })
    now = start.ms; timers.filter(t => t.at <= now).forEach(t => t.f())
    expect(sceneTrace.events().some(e => e.k === 'line-end' && e.who === 'mia' && e.id === 'mia_test')).toBe(true)
    expect(buildTimeline(sceneTrace.events()).lines.filter(l => l.who === 'mia')).toHaveLength(1)
  })

  it('проводка: директор и директор гонки пишут события одной строкой рядом с прежними вызовами', () => {
    const flow = read('./useWordLaneFlow.js'), acts = read('../../../pitrace/useRaceActs.js'), cat = read('./useCatLines.js')
    for (const s of ["sceneAnswer('win', rep)", "rh.rec('win', { ...rep, order })", "rh.rec('miss', e?.rep); sceneAnswer('miss', e?.rep)", "rh.rec('fail', e.rep); sceneAnswer('fail', e.rep ?? e.prompt)", 'rh.claim?.(e.rep, e.ms, e.y, e.share); sceneClaim(e)', 'rh.spawn?.(e); scenePill(e)', 'sceneStageOut(stages[at])', "dbg.event('finish'); scenePush('end', {})"]) expect(flow, s).toContain(s)
    for (const s of ['tr.stage(running); sceneStage(running)', "tr.begin('старт'); sceneRun(plan, stages)", 'pre(rep, e) { sceneAsk(e)']) expect(acts, s).toContain(s)
    expect(cat).toContain('sceneTrace.hint(id, line.text || line.caption)'); expect(cat).toContain("if (!voiced) scenePush('line-start', { who: 'pit', id")
    const helper = read('./wordLaneSceneTrace.js'); expect(helper).not.toMatch(/await |document\.|querySelector|addEventListener|setTimeout|setInterval/) // только запись: без DOM, ожиданий, подписок и таймеров
  })
})
