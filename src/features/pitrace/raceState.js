// Состояние «Гонки с Питом» по ходу раундов — чистый редюсер без React (по нему работают директор useRaceActs, экран RaceClimb / RaceSummary и итог raceSim): события движка → серия «Разгона», результаты «Слушай и лови», лестница «Вершины», «Спуск».
//  ev = { t: 'enter' | 'win' | 'miss' | 'fail' | 'timeout', stage, info, now }: stage — стадия (raceStages.js: act, words, ci, k, n), info — что знает движок о событии (info.idx — номер пилюли «Разгона»); enter — стадия началась;
//  now — часы (мс, performance.now): на первом заходе «Вершины» стартует общий таймер; timeout — общее время подъёма вышло (посылает директор).
//  reduceRace(state, ev) → { state, say, hint, log }: say — реплика Пита (серия 3 и 5), hint — слово, которое Пит произносит голосом (подсказка «Вершины»), log — строка журнала «[race] …».
import * as ladder from './raceLadder.js'
import { CLIMB_BONUS_MS } from './raceClimbTimer.js'

export const STREAK_GOLD = 3  // серия: пилюли вспыхивают золотом, Пит говорит race_sprint_streak
export const STREAK_FIRE = 5  // серия: Пит говорит race_sprint_fire

/** Рабочая коробка директора (useRaceActs): s — актуальное состояние, hinted — подсказка голосом сказана на этом промахе, entered — ключ последней начатой стадии. Меняется только этими функциями (линтер React не пускает прямую запись в хуке) */
export const makeBox = () => ({ s: initRace(), hinted: null, entered: '' })
export const putState = (box, s) => { box.s = s }
export const setHinted = (box, k) => { box.hinted = k }
export const takeHinted = box => { const k = box.hinted; box.hinted = null; return k }
export const markEntered = (box, key) => { box.entered = key }

export const initRace = () => ({ round: '', streak: 0, best: 0, streakMode: undefined, sprint: { words: [], results: {} }, catch: { results: {}, words: {} }, climb: null, descent: null })

const modeOf = n => (n >= STREAK_FIRE ? 'fire' : n >= STREAK_GOLD ? 'gold' : undefined)
const same = (s, patch) => ({ state: { ...s, ...patch } })
const wordTitle = w => `«${w}»`

function sprint(s, kind, stage, info) {
  const i = info?.idx
  const word = i != null ? stage.words[i]?.text : null
  const prev = i != null ? s.sprint.results[i] ?? { hit: false, miss: false } : null
  const results = i != null ? { ...s.sprint.results, [i]: kind === 'win' ? { ...prev, hit: true } : { ...prev, miss: true } } : s.sprint.results
  if (kind === 'win') {
    const streak = s.streak + 1
    return { ...same(s, { streak, best: Math.max(s.best, streak), streakMode: modeOf(streak), sprint: { ...s.sprint, results } }), say: streak === STREAK_GOLD ? 'race_sprint_streak' : streak === STREAK_FIRE ? 'race_sprint_fire' : null, log: `разгон: ${wordTitle(word)} верно, серия ${streak}` }
  }
  return { ...same(s, { streak: 0, streakMode: undefined, sprint: { ...s.sprint, results } }), log: `разгон: ${wordTitle(word ?? '…')} ${kind === 'fail' ? 'не успел' : 'промах'}, серия 0, слово к повтору` }
}

function catchRound(s, kind, stage) {
  const prev = s.catch.results[stage.ci] ?? { ok: false, bad: 0 }
  const res = kind === 'win' ? { ...prev, ok: true } : { ...prev, bad: prev.bad + 1 }
  const say = kind === 'fail' ? 'race_catch_miss' : null // провал захода (чужое слово или не успел): Пит «мимо, слушай ещё», заход повторится один раз
  return { ...same(s, { catch: { ...s.catch, results: { ...s.catch.results, [stage.ci]: res } } }), say, log: `слух ${stage.ci + 1}: ${wordTitle(stage.word.text)} ${kind === 'win' ? 'верно' : kind === 'fail' ? 'промах, заход повторится' : 'не та дорожка'}` }
}

function climbRound(s, kind, stage) {
  const c = s.climb ?? ladder.initClimb(stage.n)
  if (kind === 'timeout') { const climb = ladder.timeOut(c); return { ...same(s, { climb }), log: `вершина: время вышло на ступени ${climb.rung} из ${climb.n}, заходов ${climb.attempts}` } }
  const { climb, hint } = ladder.apply(c, kind)
  const k = ladder.targetOf(c)
  const text = kind === 'win' ? `ступень ${k} взята, времени +${CLIMB_BONUS_MS / 1000} с` : `ступень ${k} ${kind === 'miss' ? 'сказано не то' : 'не взята'}, соскальзывание на ${climb.rung}`
  const say = kind !== 'win' && !hint ? 'race_climb_slip' : null // на подсказке голосом Пит говорит слово, а не «соскользнул»
  return { ...same(s, { climb }), hint, say, log: `вершина: ${text}, заходов ${climb.attempts}${climb.top ? ', вершина' : ''}${hint ? `, подсказка голосом: ступень ${hint}` : ''}${climb.over ? ', потолок заходов' : ''}` }
}

function enter(s, stage, now) {
  if (stage.type === 'announce') return stage.round?.title ? { ...same(s, { round: stage.act }), log: `раунд: ${stage.round.title}` } : { state: s }
  if (stage.act === 'sprint') return { ...same(s, { sprint: { ...s.sprint, words: stage.words.map(w => w.text) } }), log: `разгон: ${stage.words.length} пилюль` }
  if (stage.act === 'catch') return same(s, { catch: { words: { ...s.catch.words, [stage.ci]: stage.word.text }, results: { ...s.catch.results, [stage.ci]: s.catch.results[stage.ci] ?? { ok: false, bad: 0 } } } })
  if (stage.act === 'climb' && stage.type === 'student') { const c = ladder.enter(s.climb ?? ladder.initClimb(stage.n), now); return same(s, { climb: c }) }
  return { state: s }
}

/** Итог шага: { state, say, hint, log } (say / hint / log — null, если нечего) */
export function reduceRace(s, ev) {
  const { t, stage, info, now } = ev
  if (!stage?.race || (t === 'win' && info?.last === false)) return { state: s, say: null, hint: null, log: null } // win приходит на каждую пилюлю повтора (спуск — три куска): считаем только последнюю
  let r
  if (t === 'enter') r = enter(s, stage, now)
  else if (stage.act === 'sprint' && stage.type === 'student') r = sprint(s, t, stage, info)
  else if (stage.act === 'catch') r = catchRound(s, t, stage)
  else if (stage.act === 'climb' && stage.type === 'student') r = climbRound(s, t, stage)
  else if (stage.act === 'descent' && stage.type === 'student' && t !== 'miss') r = { ...same(s, { descent: t === 'win' ? 'ok' : 'miss' }), log: `спуск: ${t === 'win' ? 'фраза сказана' : 'не успел'}` }
  else r = { state: s }
  return { state: r.state, say: r.say ?? null, hint: r.hint ?? null, log: r.log ?? null }
}

/** Какой индекс стадии идёт после стадии cur (подъём «Вершины»): ступень k, плашка вершины climb-top или «время вышло» climb-time; null — решает обычный порядок стадий.
 *  Плашка вершины стоит в списке перед climb-time, поэтому после неё обычный порядок перескакивает climb-time. */
export function climbTarget(stages, cur, s) {
  if (cur?.act !== 'climb' || !s.climb) return null
  if (cur.sid === 'climb-top') { const i = stages.findIndex(x => x.sid === 'climb-time'); return i >= 0 ? i + 1 : null }
  if (cur.type !== 'student') return null
  return climbStageIdx(stages, s.climb)
}

/** Индекс стадии, на которую подъём идёт по состоянию лестницы: ступень, плашка вершины или «время вышло»; -1 нет такой */
export function climbStageIdx(stages, c) {
  const n = ladder.nextOf(c)
  const sid = n === 'top' ? 'climb-top' : n === 'time' ? 'climb-time' : `climb-${n}`
  return stages.findIndex(x => x.sid === sid)
}
