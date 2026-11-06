// Состояние игры «Встряхни память» («Гонка с Питом») по ходу раундов — чистый редюсер без React (по нему работают директор useRaceActs, экран RaceClimb / RaceSummary и итог raceSim): события движка → серия «Разгона», результаты «Слушай и лови», лестница «Вершины», «Спуск».
//  ev = { t: 'enter' | 'win' | 'miss' | 'fail' | 'timeout' | 'claim' | 'phrase', stage, info, now } (phrase — итог хода этапа «Фразы», info — событие raceStatePhrases.phraseEvent: s.phrases пополняется): stage — стадия (raceStages.js: act, words, ci, k, n), info — что знает движок о событии (info.idx — номер пилюли «Разгона»); enter — стадия началась;
//  info.heard — что услышал Vosk (ставит директор на промахе): двойник слова ступени с ловушкой (raceTrap.js) — ловушка осыпается, trap в ответе = { said, word }, Пит говорит про двойника;
//  now — часы (мс, performance.now): на первом заходе «Вершины» стартует общий таймер; timeout — общее время подъёма вышло (посылает директор).
//  reduceRace(state, ev) → { state, say, hint, trap, log }: say — реплика Пита (мини-реплика успеха «Разгона» на принятии слова), hint — слово, которое Пит произносит голосом (подсказка «Вершины»), trap — { said, word } (ловушка сработала), log — строка журнала «[race] …».
import * as ladder from './raceLadder.js'
import { CLIMB_BONUS_MS } from './raceClimbTimer.js'
import { trapSaid } from './raceTrap.js'
import { phraseStep } from './raceStatePhrases.js'

export const STREAK_GOLD = 3  // серия: пилюли вспыхивают золотом (голосом серии больше нет: мини-реплики успеха — raceGood.js)
export const STREAK_FIRE = 5  // серия: тёплое свечение

/** Рабочая коробка директора (useRaceActs): s — актуальное состояние, hinted — подсказка голосом сказана на этом промахе, entered — ключ последней начатой стадии. Меняется только этими функциями (линтер React не пускает прямую запись в хуке) */
export const makeBox = () => ({ s: initRace(), hinted: null, entered: '' })
export const putState = (box, s) => { box.s = s }
export const setHinted = (box, k) => { box.hinted = k }
export const takeHinted = box => { const k = box.hinted; box.hinted = null; return k }
export const markEntered = (box, key) => { box.entered = key }

export const initRace = () => ({ round: '', streak: 0, best: 0, streakMode: undefined, sprint: { words: [], caps: {}, traps: [], results: {}, claims: 0, r2: null }, catch: { words: [], caps: {}, traps: [], results: {}, claims: 0, r2: null }, climb: null, descent: null, phrases: [] })

const modeOf = n => (n >= STREAK_FIRE ? 'fire' : n >= STREAK_GOLD ? 'gold' : undefined)
const same = (s, patch) => ({ state: { ...s, ...patch } })
const wordTitle = w => `«${w}»`
/** Данные для точности слова из зачёта (useRaceActs.claim): life — окно жизни пилюли, мс; fill — заливка голосом 0…1; tap — ответ тапом */
const accInfo = info => ({ ...(info.life > 0 ? { life: info.life } : {}), ...(Number.isFinite(info.fill) ? { fill: info.fill } : {}), ...(info.tap ? { tap: true } : {}) })

// Проходы A (sprint) и B (catch) — одна механика очереди пилюль, состояние одинаковой формы: s.sprint / s.catch = { words, caps, traps, results: { номер пилюли: { hit, miss, ms, late, trap, believed, life, fill, tap, wrong } }, claims, r2 } (r2 — то же для дополнительного круга).
// hit — верное действие (слово сказано верно / ловушку пропустил), miss — ошибка (чужое слово, «не успел», «поверил чужому слову»), ms — время ответа от выезда пилюли до зачёта, late — ответ «в последний момент» (пилюля уже ниже LATE_Y, raceExtraRound.js), trap — пилюля с чужим английским словом, believed — на ней сказал слово.
function queue(s, kind, stage, info) {
  const k = stage.act, second = stage.sid === `${k}2`
  const i = info?.idx
  const w = i != null ? stage.words[i] : null
  const word = w?.text ?? null
  const base = s[k]
  const cur = second ? base.r2 ?? { words: [], results: {}, claims: 0 } : base
  const prev = i != null ? { hit: false, miss: false, ...cur.results[i] } : null
  const put = patch => (second ? { ...base, r2: { ...cur, ...patch } } : { ...base, ...patch })
  const done = patch => put({ results: i != null ? { ...cur.results, [i]: { ...prev, ...patch } } : cur.results })
  const tag = `${k === 'catch' ? 'проход B' : 'проход A'}${second ? ' (второй круг)' : ''}`
  const wrong = kind === 'miss' && prev ? { wrong: (prev.wrong ?? 0) + 1 } : {} // сколько раз на пилюле было «не то» (голосом или тапом по чужой) — для точности слова (raceAccuracy.js)
  const fell = (patch, log) => ({ ...same(s, { streak: 0, streakMode: undefined, [k]: done({ ...patch, ...wrong }) }), log: `${tag}: ${wordTitle(word ?? '…')} ${log}, серия 0, слово к повтору` })
  if (kind === 'claim') { // слово принято: время ответа и мини-реплика успеха по плану круга (raceGood.js), следующая пилюля ждёт, пока Пит договорит
    const claims = cur.claims + 1
    const timed = i != null ? { results: { ...cur.results, [i]: { ...prev, ms: info.ms ?? prev.ms ?? null, late: !!info.late, ...accInfo(info) } } } : {}
    return { ...same(s, { [k]: put({ claims, ...timed }) }), say: stage.good?.find(g => g.at === claims)?.id ?? null }
  }
  if (w?.trap) { // пилюля с чужим переводом: верное действие — промолчать
    if (kind === 'miss') return info.believed ? fell({ trap: true, miss: true, believed: true }, 'поверил чужому переводу') : { state: s }
    if (kind === 'fail' && !prev.believed) { const streak = s.streak + 1; return { ...same(s, { streak, best: Math.max(s.best, streak), streakMode: modeOf(streak), [k]: done({ trap: true, hit: true }) }), log: `${tag}: ${wordTitle(word)} ловушка пропущена, серия ${streak}` } }
    return { ...same(s, { [k]: done({ trap: true, hit: true }) }), log: `${tag}: ${wordTitle(word)} ловушка, до этого поверил` }
  }
  if (kind === 'win') {
    const streak = s.streak + 1
    return { ...same(s, { streak, best: Math.max(s.best, streak), streakMode: modeOf(streak), [k]: done({ hit: true }) }), log: `${tag}: ${wordTitle(word)} верно${prev?.ms ? ` за ${prev.ms} мс` : ''}, серия ${streak}` }
  }
  return fell({ miss: true }, kind === 'fail' ? 'не успел' : 'промах')
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
  if ((stage.act === 'sprint' || stage.act === 'catch') && stage.type === 'student') {
    const k = stage.act, name = k === 'catch' ? 'проход B' : 'проход A', texts = stage.words.map(w => w.text), traps = stage.words.map(w => !!w.trap)
    if (stage.sid === `${k}2`) return { ...same(s, { [k]: { ...s[k], r2: { words: texts, traps, results: {}, claims: 0 } } }), log: `${name}, второй круг: ${texts.length} пилюль (${texts.join(', ')})` }
    return { ...same(s, { [k]: { ...s[k], words: texts, traps, caps: Object.fromEntries(stage.words.map(w => [w.text, w.translation])) } }), log: `${name}: ${texts.length} пилюль${traps.some(Boolean) ? `, ловушек ${traps.filter(Boolean).length}` : ''}` }
  }
  if (stage.act === 'climb' && stage.type === 'student') { const c = ladder.enter(s.climb ?? ladder.initClimb(stage.n, stage.trap), now); return same(s, { climb: c }) }
  return { state: s }
}

/** Итог шага: { state, say, hint, log } (say / hint / log — null, если нечего) */
export function reduceRace(s, ev) {
  const { t, stage, info, now } = ev
  if (!stage?.race || (t === 'win' && info?.last === false) || (t === 'claim' && !['sprint', 'catch'].includes(stage.act))) return { state: s, say: null, hint: null, trap: null, log: null } // win приходит на каждую пилюлю повтора (спуск — три куска): считаем только последнюю
  let r
  if (t === 'enter') r = enter(s, stage, now)
  else if (t === 'phrase') r = info?.phraseKey ? phraseStep(s, info) : { state: s }
  else if ((stage.act === 'sprint' || stage.act === 'catch') && stage.type === 'student') r = queue(s, t, stage, info)
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
