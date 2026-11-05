// Общий набор для сборки стадий «Гонки с Питом» (raceStages*.js): длина озвучки слова, список стадий, плашка раунда, шаг ученика. Чистые функции. Формат стадий — тот же, что у репетиции (rehearsalStages.js) и обычной игры
// (wordLaneStages.js): announce / dictor / turn / student / discern; сверх формата — race: true, act (sprint, catch, climb, descent, summary) и поля раундов (words, k, ci).
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { makeLib } from '../player/modules/rotate-phone/wordLaneLib.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { raceTexts } from './raceTexts.js'
import { vocabOf } from './raceWords.js'
import { goodPlan } from './raceGood.js'

export const RACE_ANNOUNCE_MS = 1700 // плашка раунда
export const RACE_TOP_MS = 2600      // вершина: золотая плашка и реплика Пита
export const PRE_SAY_GAP_MS = 450    // «Разгон» и «Слушай и лови»: выдержка между зачётом слова (взлёт пилюли) или «не успел» и голосом Пита со следующим переводом / словом: без неё голос
                                     // налетает на только что принятое слово и счёт «зачёл → следующее» не ощущается; после реплики успеха паузы нет (её длину держит сама реплика, claimGap)
export const CLAIM_GAP_MS = 60       // пауза после принятия слова с репликой успеха до выезда следующей пилюли
export const ROUND2_ANN_MS = 400     // «плашки» второго круга нет: стадия держится, пока Пит говорит

export function createKit({ plan, rate = 1, lib = () => null }) {
  const r = rate > 0 ? rate : 1
  const texts = raceTexts(plan)
  const textLib = makeLib(texts)
  const stages = []
  const push = s => { stages.push({ ...s, idx: stages.length, race: true }); return s }
  return {
    plan, chunks: plan.chunks, rate: r, lib, stages, push,
    /** Длина озвучки слова или куска из библиотеки слов (нет её — оценка), мс; k — во сколько раз быстрее */
    msOf: (text, k = 1) => { const i = texts.findIndex(t => normText(t) === normText(text)); return (textLib(i)?.ms ?? estChunkMs(text)) / r / k },
    /** Двойники слова из плана (для словаря Vosk и ловушек) */
    doubles: word => plan.words.find(w => normText(w.text) === normText(word))?.confusers ?? [],
    /** Плашка раунда: Пит говорит реплику акта (директор держит плашку, пока он говорит) */
    announce: (act, o = {}) => push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, round: { kind: o.kind ?? act.id, title: o.title ?? act.title, task: o.task ?? act.task, brief: o.brief ?? (o.task === undefined ? act.brief : undefined) }, ms: o.ms ?? RACE_ANNOUNCE_MS, line: o.line === undefined ? act.line : o.line }),
  }
}

/** Ступень ученика: подписей над дорожками нет (labels пусто), дорожки взведены все */
export const stepOf = (id, o) => ({ id, kind: 'student', labels: [], active: [0, 1, 2], ...o })

/**
 * Ступень очереди пилюль «Разгона» и «Слушай и лови» (одна общая механика, CONCEPT_RACE.md): N повторов по одному слову, у каждого своя дорожка (lane) и скорость (speed); rep(w) — поля, чем этап отличается (cap — перевод внутри пилюли,
 * say — слово, которое Пит говорит голосом перед выездом, trap — пилюля с чужим переводом). Флаги ступени (движок читает их сам, wordLaneStudent.js): overlap — очередь, следующая пилюля выезжает сразу, как текущая принята или недоступна;
 * quiet — промах без полос и без английского слова (на неверное слово микро-анимация на самой пилюле, упущенная уезжает молча); edge — у краёв экрана пилюля чуть меньше; holdAll — следующая пилюля ждёт, пока Пит договорит; preSay — перед выездом
 * Пит говорит перевод / слово (useRaceActs.pre); preGap — выдержка PRE_SAY_GAP_MS перед этим голосом после зачёта и «не успел»; claimGap + goodAt — на принятиях с репликой успеха (raceGood.js) следующая пилюля через CLAIM_GAP_MS. maxTries 1: упущенную не повторяют.
 */
export function queueStep(kit, id, words, good, rep) {
  const targets = words.map(w => w.text)
  return stepOf(id, {
    parts: words.map((_, i) => i), text: targets.join(' '), chunks: targets, chunkMs: targets.map(t => kit.msOf(t)),
    reps: words.map((w, i) => ({ parts: [i], lane: w.lane, speed: w.speed, ...rep(w) })),
    extra: vocabOf(targets, words.flatMap(w => [...w.confusers, ...kit.doubles(w.text)])), maxWords: 2, maxTries: 1, overlap: true,
    quiet: true, edge: true, holdAll: true, preSay: true, preGap: PRE_SAY_GAP_MS, claimGap: CLAIM_GAP_MS, goodAt: good.map(g => g.at),
  })
}

/**
 * Стадии этапа-очереди act (sprint или catch): плашка + круг 1 (sid = act.id) + реплика второго круга + круг 2 (sid = act.id + '2'). Стадии второго круга стоят в списке всегда; директор идёт на них, только если в первом круге были ошибки,
 * и перед этим вписывает слова в круг 2 (stage.fill, raceSprint2.js). rep(w) — как у queueStep.
 */
export function queueStages(kit, act, rep) {
  const { push, announce, plan } = kit
  const sid2 = `${act.id}2`
  const round = (sid, list, first) => { const good = goodPlan(plan.seed, sid, list.length, { first }); return { type: 'student', act: act.id, sid, step: queueStep(kit, sid, list, good, rep), words: list, good } }
  announce(act)
  push(round(act.id, act.words, true))
  announce(act, { sid: sid2, title: '', task: '', line: 'race_sprint_round2', ms: ROUND2_ANN_MS })
  push({ ...round(sid2, act.words, false), fill: list => Object.assign(kit.stages.find(x => x.sid === sid2), round(sid2, list, false)) })
}
