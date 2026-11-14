// Общий набор для сборки стадий игры «Встряхни память» («Гонка с Питом») (raceStages*.js): длина озвучки слова, список стадий, плашка раунда, шаг ученика. Чистые функции. Формат стадий — тот же, что у репетиции (rehearsalStages.js) и обычной игры
// (wordLaneStages.js): announce / dictor / turn / student / discern; сверх формата — race: true, act (sprint, catch, climb, descent, summary) и поля раундов (words, k, ci).
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { makeLib } from '../player/modules/rotate-phone/wordLaneLib.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { raceTexts } from './raceTexts.js'
import { vocabOf } from './raceWords.js'
import { goodPlan } from './raceGood.js'
import { standbyWords } from './raceStandby.js'

export const RACE_ANNOUNCE_MS = 1700 // плашка раунда
export const RACE_TOP_MS = 2600      // вершина: золотая плашка и реплика Пита
export const PRE_SAY_GAP_MS = 450    // «Разгон» и «Слушай и лови»: выдержка между зачётом слова (взлёт пилюли) или «не успел» и голосом Пита со следующим переводом / словом: без неё голос
                                     // налетает на только что принятое слово и счёт «зачёл → следующее» не ощущается; после реплики успеха паузы нет (её длину держит сама реплика, claimGap)
export const CLAIM_GAP_MS = 60       // пауза после принятия слова с репликой успеха до выезда следующей пилюли
export const ROUND2_ANN_MS = 400     // «плашки» второго круга нет: стадия держится, пока Пит говорит

export function createKit({ plan, rate = 1, lib = () => null, tap = false }) { // tap — «Тапаю»: все ступени без микрофона и Vosk (step.tapOnly), в том числе добранный второй круг
  const r = rate > 0 ? rate : 1
  const texts = raceTexts(plan)
  const textLib = makeLib(texts)
  const stages = []
  const push = s => { stages.push({ ...s, idx: stages.length, race: true }); return s }
  return {
    plan, chunks: plan.chunks, rate: r, lib, stages, push, tap: !!tap,
    /** Длина озвучки слова или куска из библиотеки слов (нет её — оценка), мс; k — во сколько раз быстрее */
    msOf: (text, k = 1) => { const i = texts.findIndex(t => normText(t) === normText(text)); return (textLib(i)?.ms ?? estChunkMs(text)) / r / k },
    /** Двойники слова из плана (для словаря Vosk и ловушек) */
    doubles: word => plan.words.find(w => normText(w.text) === normText(word))?.confusers ?? [],
    /** Плашка раунда: Пит говорит реплику акта (директор держит плашку, пока он говорит); o.look — вид плашки { tone: 'lane' | 'accent', icon: 'tap' | 'mic' } (круги «Фраз», WordLaneTurnPlate) */
    announce: (act, o = {}) => push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, round: { kind: o.kind ?? act.id, title: o.title ?? act.title, task: o.task ?? act.task, brief: o.brief ?? (o.task === undefined ? act.brief : undefined), ...(o.look ? { look: o.look } : {}) }, ms: o.ms ?? RACE_ANNOUNCE_MS, line: o.line === undefined ? act.line : o.line }),
  }
}

/** Ступень ученика: подписей над дорожками нет (labels пусто), дорожки взведены все */
export const stepOf = (id, o) => ({ id, kind: 'student', labels: [], active: [0, 1, 2], ...o })

/**
 * Ступень очереди пилюль проходов A и B (одна общая механика, CONCEPT_RACE.md): N повторов по одному слову, у каждого своя дорожка (lane) и скорость (speed); rep(w) — поля, чем проход отличается (cap — надпись внутри пилюли,
 * say — слово, которое Пит говорит голосом перед выездом, trap — пилюля с чужим английским словом). Флаги ступени (движок читает их сам, wordLaneStudent.js): overlap — очередь, следующая пилюля выезжает сразу, как текущая принята или недоступна;
 * quiet — промах без полос и без английского слова (на неверное слово микро-анимация на самой пилюле, упущенная уезжает молча); edge — у краёв экрана пилюля чуть меньше; holdAll — следующая пилюля ждёт, пока Пит договорит; preSay — перед выездом
 * Пит говорит перевод / слово (useRaceActs.pre); preGap — выдержка PRE_SAY_GAP_MS перед этим голосом после зачёта и «не успел»; claimGap + goodAt — на принятиях с репликой успеха (raceGood.js) следующая пилюля через CLAIM_GAP_MS. maxTries 1: упущенную не повторяют.
 * o: target(w) — что ученик должен СКАЗАТЬ (по умолчанию английское слово; в проходе B — русский перевод), lang 'ru' — слушает русская модель (словарь — переводы круга, двойников нет), tapOnly — модель не нужна: ответ только тапом по трём пилюлям.
 */
export function queueStep(kit, id, words, good, rep, o = {}) {
  const targets = words.map(w => o.target?.(w) ?? w.text)
  return stepOf(id, {
    parts: words.map((_, i) => i), text: targets.join(' '), chunks: targets, chunkMs: targets.map(t => kit.msOf(t)),
    reps: words.map((w, i) => ({ parts: [i], lane: w.lane, speed: w.speed, ...rep(w) })),
    extra: o.lang === 'ru' ? [] : vocabOf(targets, words.flatMap(w => [...w.confusers, ...kit.doubles(w.text)])), maxWords: 2, maxTries: 1, overlap: true,
    boost: { k: 1 }, quiet: true, edge: true, holdAll: true, preSay: true, preGap: PRE_SAY_GAP_MS, claimGap: CLAIM_GAP_MS, goodAt: good.map(g => g.at),
    ...(o.lang ? { lang: o.lang } : {}), ...(o.tapOnly || kit.tap ? { tapOnly: true } : {}),
  })
}

/**
 * Стадии прохода act (sprint или catch): [переключение слуха, если o.before] + плашка (или объявление без плашки, o.plain) + круг 1 (sid = act.id) + реплика дополнительного круга + круг 2 (sid = act.id + '2'). Стадии круга 2 стоят в списке всегда;
 * директор идёт на них, только если слабых слов две и больше, и перед этим вписывает слова в круг 2 (stage.fill, raceExtraRound.js). rep(w) — как у queueStep. o.mapStandby(w) — как дежурное слово выглядит в этом проходе
 * (поля shown / trap); дежурные слова лежат в stage.standby круга 1. o.goodIds — из каких реплик успеха выбирать (проход B: только race_good_ok); o.lang / o.tapOnly / o.target — см. queueStep; у круга 1 есть demote(): русская модель не включилась — проход переводится на тап (и реплика объявления меняется на o.tapLine).
 */
export function queueStages(kit, act, rep, o = {}) {
  const { push, announce, plan } = kit
  const sid2 = `${act.id}2`
  const ctl = { lang: o.lang, tapOnly: !!o.tapOnly }
  const standby = standbyWords(act.words, plan).map(w => o.mapStandby?.(w) ?? w)
  const round = (sid, list, first) => { const good = goodPlan(plan.seed, sid, list.length, { first, ids: o.goodIds }); return { type: 'student', act: act.id, sid, step: queueStep(kit, sid, list, good, rep, { target: o.target, lang: ctl.lang, tapOnly: ctl.tapOnly }), words: list, good } }
  const demote = () => { if (o.tapLine) { const a = kit.stages.find(x => x.sid === `${act.id}-ann`); if (a) a.line = o.tapLine } ctl.lang = undefined; ctl.tapOnly = true; kit.stages.filter(x => x.act === act.id && x.type === 'student').forEach(x => { delete x.step.lang; x.step.tapOnly = true }) }
  o.before?.()
  announce(act, o.plain ? { title: '', task: '', ms: ROUND2_ANN_MS } : undefined)
  push({ ...round(act.id, act.words, true), standby, demote })
  announce(act, { sid: sid2, title: '', task: '', line: 'race_sprint_round2', ms: ROUND2_ANN_MS })
  push({ ...round(sid2, act.words, false), fill: list => Object.assign(kit.stages.find(x => x.sid === sid2), round(sid2, list, false)) })
}
