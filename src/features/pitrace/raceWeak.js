// «Самые слабые слова» итога (CONCEPT_RACE.md, «Финиш»): по результатам обоих проходов — A «скажи слово» и B «назови перевод» (состояние raceState.js: sprint / catch = { words, caps, results, r2 }), включая дополнительные круги, — строит список слов от самых слабых к самым сильным.
// Счёт слабости слова — сумма по проходам: пропуск или ошибка в первом круге = 2, в дополнительном круге = 3, ответ «в последний момент» = 1, верно вовремя = 0 (бонуса за быстрый ответ нет). В проходе B ошибкой считается и «поверил чужому слову»
// (слово на пилюле-ловушке, записывается на слово, которое Пит произнёс), и ответ на пилюлю не тем словом, и пропуск верной пилюли. Цвет чипа — по счёту: красный (3 и больше), жёлтый (1–2), зелёный (0). Чистая функция без React.
import { failedIn } from './raceExtraRound.js'
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'

export const WEAK_MAX = 8      // по умолчанию слов не больше (экран итога просит больше: список на весь экран)
export const WEAK_R1 = 2       // ошибка в первом круге
export const WEAK_R2 = 3       // ошибка во втором круге
export const WEAK_LATE = 1     // ответ «в последний момент» (слово засчитано, но пилюля уже ниже LATE_Y): один балл слабости
export const WEAK_RED = 3      // с этого счёта чип красный

/** Цвет чипа по счёту слабости: 'red' | 'yellow' | 'green' */
export const weakTone = score => (score >= WEAK_RED ? 'red' : score > 0 ? 'yellow' : 'green')

/** Пометка слова в итоге по результатам одного круга: ошибка (сказал не то), молчал (не сказал), поздно (засчитано в последний момент), верно */
const noteOf = r => (!r || (!r.hit && !r.miss) ? 'молчал' : failedIn(r) ? 'ошибка' : r.late ? 'поздно' : 'верно')
const NOTE_RANK = { верно: 0, поздно: 1, молчал: 2, ошибка: 3 }

/** Самая плохая пометка слова text на этапе stage (первый и дополнительный круги); слова на этапе нет — null */
function stageNote(stage, text) {
  const i = stage?.words?.findIndex(w => normText(w) === normText(text)) ?? -1
  if (i < 0) return null
  const j = stage.r2?.words?.findIndex(w => normText(w) === normText(text)) ?? -1
  const notes = [noteOf(stage.results?.[i]), ...(j >= 0 ? [noteOf(stage.r2.results?.[j])] : [])]
  return notes.reduce((a, n) => (NOTE_RANK[n] > NOTE_RANK[a] ? n : a))
}

/** Счёт слабости слова text на одном этапе (stage = { words, results, r2 }); слова нет на этапе — 0 */
function stageScore(stage, text) {
  const i = stage?.words?.findIndex(w => normText(w) === normText(text)) ?? -1
  if (i < 0) return 0
  const j = stage.r2?.words?.findIndex(w => normText(w) === normText(text)) ?? -1
  const part = (r, fail) => (failedIn(r) ? fail : r?.late ? WEAK_LATE : 0)
  return part(stage.results?.[i], WEAK_R1) + (j >= 0 ? part(stage.r2.results?.[j], WEAK_R2) : 0)
}

/**
 * race — состояние гонки ({ sprint, catch }; для старых вызовов можно передать само состояние разгона — тогда это один этап). → [{ text, translation, score, tone }], самые слабые первыми
 * (при равном счёте — по порядку выезда в разгоне, слова только из «Слушай и лови» — после них), не больше max.
 */
export function weakWords(race, max = WEAK_MAX) {
  const stages = race?.sprint || race?.catch ? [race.sprint, race.catch].filter(Boolean) : [race].filter(Boolean)
  const seen = new Set()
  const list = []
  for (const st of stages) for (const text of st.words ?? []) {
    const k = normText(text)
    if (seen.has(k)) continue
    seen.add(k)
    const score = stages.reduce((a, x) => a + stageScore(x, text), 0)
    list.push({ at: list.length, text, translation: stages.map(x => x.caps?.[text]).find(Boolean) ?? '', score, tone: weakTone(score), note: stages.map(x => stageNote(x, text)).filter(Boolean).reduce((a, n) => (a == null || NOTE_RANK[n] > NOTE_RANK[a] ? n : a), null) ?? 'верно' })
  }
  return list.sort((a, b) => b.score - a.score || a.at - b.at).slice(0, max).map(w => ({ text: w.text, translation: w.translation, score: w.score, tone: w.tone, note: w.note }))
}
