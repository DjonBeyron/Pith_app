// Состояние «Гонки с Питом» по ходу раундов — чистый редюсер без React (по нему работают директор useRaceActs, экран RaceClimb / RaceSummary и итог raceSim): события движка → серия «Разгона», результаты «Слушай и лови», лестница «Вершины», «Спуск».
//  ev = { t: 'enter' | 'win' | 'miss' | 'fail' | 'timeout' | 'claim', stage, info, now }: stage — стадия (raceStages.js: act, words, ci, k, n), info — что знает движок о событии (info.idx — номер пилюли «Разгона»); enter — стадия началась;
//  info.heard — что услышал Vosk (ставит директор на промахе): двойник слова ступени с ловушкой (raceTrap.js) — ловушка осыпается, trap в ответе = { said, word }, Пит говорит про двойника;
//  now — часы (мс, performance.now): на первом заходе «Вершины» стартует общий таймер; timeout — общее время подъёма вышло (посылает директор).
//  reduceRace(state, ev) → { state, say, hint, trap, log }: say — реплика Пита (мини-реплика успеха «Разгона» на принятии слова), hint — слово, которое Пит произносит голосом (подсказка «Вершины»), trap — { said, word } (ловушка сработала), log — строка журнала «[race] …».
import * as ladder from './raceLadder.js'
import { CLIMB_BONUS_MS } from './raceClimbTimer.js'
import { trapSaid } from './raceTrap.js'

export const STREAK_GOLD = 3  // серия: пилюли вспыхивают золотом (голосом серии больше нет: мини-реплики успеха — raceGood.js)
export const STREAK_FIRE = 5  // серия: тёплое свечение

/** Рабочая коробка директора (useRaceActs): s — актуальное состояние, hinted — подсказка голосом сказана на этом промахе, entered — ключ последней начатой стадии. Меняется только этими функциями (линтер React не пускает прямую запись в хуке) */
export const makeBox = () => ({ s: initRace(), hinted: null, entered: '' })
export const putState = (box, s) => { box.s = s }
export const setHinted = (box, k) => { box.hinted = k }
export const takeHinted = box => { const k = box.hinted; box.hinted = null; return k }
export const markEntered = (box, key) => { box.entered = key }

export const initRace = () => ({ round: '', streak: 0, best: 0, streakMode: undefined, sprint: { words: [], caps: {}, results: {}, claims: 0, r2: null }, catch: { results: {}, words: {} }, climb: null, descent: null })

const modeOf = n => (n >= STREAK_FIRE ? 'fire' : n >= STREAK_GOLD ? 'gold' : undefined)
const same = (s, patch) => ({ state: { ...s, ...patch } })
const wordTitle = w => `«${w}»`

function sprint(s, kind, stage, info) {
  const second = stage.sid === 'sprint2'
  const i = info?.idx
  const word = i != null ? stage.words[i]?.text : null
  const cur = second ? s.sprint.r2 ?? { words: [], results: {}, claims: 0 } : s.sprint
  const prev = i != null ? cur.results[i] ?? { hit: false, miss: false } : null
  const results = i != null ? { ...cur.results, [i]: kind === 'win' ? { ...prev, hit: true } : { ...prev, miss: true } } : cur.results
  const put = patch => (second ? { ...s.sprint, r2: { ...cur, ...patch } } : { ...s.sprint, ...patch })
  const tag = second ? ' (второй круг)' : ''
  if (kind === 'claim') { // слово принято: мини-реплика успеха по плану круга (raceGood.js), следующая пилюля ждёт, пока Пит договорит
    const claims = cur.claims + 1
    return { ...same(s, { sprint: put({ claims }) }), say: stage.good?.find(g => g.at === claims)?.id ?? null }
  }
  if (kind === 'win') {
    const streak = s.streak + 1
    return { ...same(s, { streak, best: Math.max(s.best, streak), streakMode: modeOf(streak), sprint: put({ results }) }), log: `разгон${tag}: ${wordTitle(word)} верно, серия ${streak}` }
  }
  return { ...same(s, { streak: 0, streakMode: undefined, sprint: put({ results }) }), log: `разгон${tag}: ${wordTitle(word ?? '…')} ${kind === 'fail' ? 'не успел' : 'промах'}, серия 0, слово к повтору` }
}

function catchRound(s, kind, stage) {
  const prev = s.catch.results[stage.ci] ?? { ok: false, bad: 0 }
  const res = kind === 'win' ? { ...prev, ok: true } : { ...prev, bad: prev.bad + 1 }
  const say = kind === 'fail' ? 'race_catch_miss' : null // провал захода (чужое слово или не успел): Пит «мимо, слушай ещё», заход повторится один раз
  return { ...same(s, { catch: { ...s.catch, results: { ...s.catch.results, [stage.ci]: res } } }), say, log: `слух ${stage.ci + 1}: ${wordTitle(stage.word.text)} ${kind === 'win' ? 'верно' : kind === 'fail' ? 'промах, заход повторится' : 'не та дорожка'}` }
}

function climbRound(s, kind, stage, info) {
  const c = s.climb ?? ladder.initClimb(stage.n, stage.trap)
  if (kind === 'timeout') { const climb = ladder.timeOut(c); return { ...same(s, { climb }), log: `вершина: время вышло на ступени ${climb.rung} из ${climb.n}, заходов ${climb.attempts}` } }
  const said = kind === 'miss' ? trapSaid(info?.heard, stage.word, stage.confusers) : null // двойник вместо слова (только на ступени с ловушкой это что-то меняет)
  const { climb, hint, trapped } = ladder.apply(c, kind, said)
  const k = ladder.targetOf(c)
  const text = kind === 'win' ? `ступень ${k} взята, времени +${CLIMB_BONUS_MS / 1000} с` : `ступень ${k} ${kind === 'miss' ? 'сказано не то' : 'не взята'}, соскальзывание на ${climb.rung}`
  const say = kind !== 'win' && !hint && !trapped ? 'race_climb_slip' : null // на подсказке голосом Пит говорит слово, на ловушке — про двойника, а не «соскользнул»
  const fell = kind === 'win' && c.trap?.state === 'stand' && climb.trap?.state === 'fell'
  const extra = `${hint ? `, подсказка голосом: ступень ${hint}` : ''}${trapped ? `, ловушка: сказал двойник «${trapped}»` : ''}${fell ? ', ловушка провалилась' : ''}`
  return { ...same(s, { climb }), hint, say, trap: trapped ? { said: trapped, word: stage.word } : null, log: `вершина: ${text}, заходов ${climb.attempts}${climb.top ? ', вершина' : ''}${extra}${climb.over ? ', потолок заходов' : ''}` }
}

function enter(s, stage, now) {
  if (stage.type === 'announce') return stage.round?.title ? { ...same(s, { round: stage.act }), log: `раунд: ${stage.round.title}` } : { state: s }
  if (stage.act === 'sprint' && stage.sid === 'sprint2') return { ...same(s, { sprint: { ...s.sprint, r2: { words: stage.words.map(w => w.text), results: {}, claims: 0 } } }), log: `разгон, второй круг: ${stage.words.length} пилюль (${stage.words.map(w => w.text).join(', ')})` }
  if (stage.act === 'sprint') return { ...same(s, { sprint: { ...s.sprint, words: stage.words.map(w => w.text), caps: Object.fromEntries(stage.words.map(w => [w.text, w.translation])) } }), log: `разгон: ${stage.words.length} пилюль` }
  if (stage.act === 'catch') return same(s, { catch: { words: { ...s.catch.words, [stage.ci]: stage.word.text }, results: { ...s.catch.results, [stage.ci]: s.catch.results[stage.ci] ?? { ok: false, bad: 0 } } } })
  if (stage.act === 'climb' && stage.type === 'student') { const c = ladder.enter(s.climb ?? ladder.initClimb(stage.n, stage.trap), now); return same(s, { climb: c }) }
  return { state: s }
}

/** Итог шага: { state, say, hint, log } (say / hint / log — null, если нечего) */
export function reduceRace(s, ev) {
  const { t, stage, info, now } = ev
  if (!stage?.race || (t === 'win' && info?.last === false) || (t === 'claim' && stage.act !== 'sprint')) return { state: s, say: null, hint: null, trap: null, log: null } // win приходит на каждую пилюлю повтора (спуск — три куска): считаем только последнюю
  let r
  if (t === 'enter') r = enter(s, stage, now)
  else if (stage.act === 'sprint' && stage.type === 'student') r = sprint(s, t, stage, info)
  else if (stage.act === 'catch') r = catchRound(s, t, stage)
  else if (stage.act === 'climb' && stage.type === 'student') r = climbRound(s, t, stage, info)
  else if (stage.act === 'descent' && stage.type === 'student' && t !== 'miss') r = { ...same(s, { descent: t === 'win' ? 'ok' : 'miss' }), log: `спуск: ${t === 'win' ? 'фраза сказана' : 'не успел'}` }
  else r = { state: s }
  return { state: r.state, say: r.say ?? null, hint: r.hint ?? null, trap: r.trap ?? null, log: r.log ?? null }
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
