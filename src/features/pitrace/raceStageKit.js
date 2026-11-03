// Общий набор для сборки стадий «Гонки с Питом» (raceStages*.js): длина озвучки слова, список стадий, плашка раунда, шаг ученика. Чистые функции. Формат стадий — тот же, что у репетиции (rehearsalStages.js) и обычной игры
// (wordLaneStages.js): announce / dictor / turn / student / discern; сверх формата — race: true, act (sprint, catch, climb, descent, summary) и поля раундов (words, k, ci).
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { makeLib } from '../player/modules/rotate-phone/wordLaneLib.js'
import { estChunkMs } from '../player/modules/rotate-phone/wordLaneAudio.js'
import { raceTexts } from './raceTexts.js'

export const RACE_ANNOUNCE_MS = 1700 // плашка раунда
export const RACE_TOP_MS = 2600      // вершина: золотая плашка и реплика Пита

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
    announce: (act, o = {}) => push({ type: 'announce', act: act.id, sid: `${o.sid ?? act.id}-ann`, round: { kind: o.kind ?? act.id, title: o.title ?? act.title }, ms: o.ms ?? RACE_ANNOUNCE_MS, line: o.line === undefined ? act.line : o.line }),
  }
}

/** Ступень ученика: подписей над дорожками нет (labels пусто), дорожки взведены все */
export const stepOf = (id, o) => ({ id, kind: 'student', labels: [], active: [0, 1, 2], ...o })
