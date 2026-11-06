// Что «Гонке с Питом» готовить в тапе «Начать» (wordLaneStart.wordsPlan): озвучку каких слов качать и измерять и какие реплики Пита нужны к самому старту. Чистые функции без React.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { planTexts } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'
import { phraseTexts } from './racePhraseData.js'
import { isMode } from './raceOnly.js'
import { readTapMode } from '../player/modules/rotate-phone/wordLaneHudSettings.js'

/** Тексты, которые должна озвучить библиотека слов: куски, слова плана, двойники, слова фразы, добор «Разгона» (слова других планов) и слова фраз этапа 2 (Пит читает фразу по словам, racePhraseData.js); у раунда (plan.round) — всё то же */
export function raceTexts(plan) {
  const seen = new Set()
  return [...planTexts(plan), ...extrasOf(plan).flatMap(w => [w.text, ...(w.confusers ?? [])]), ...phraseTexts(plan)].filter(t => { const k = normText(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

/** Стартовая фраза по режиму: «Голосом» — race_start, «Пальцами» (tap) — race_start_tap */
export const raceStartId = (tap = readTapMode()) => (tap ? 'race_start_tap' : 'race_start')

/** Есть ли у плана стартовая фраза: полная гонка, режимы этапов (raceOnly.MODES) и один «Проход A» — да (она заменяет объявление этапа A); другой одиночный раунд — нет, там говорит его реплика */
export const raceHasStart = plan => !plan.round || isMode(plan.round) || plan.round === 'sprint'

/** Первые реплики гонки: стартовая фраза режима (если она есть у плана) и реплика первого акта (если есть) — к самому старту ждём только их */
export function raceFirstLines(plan, acts, tap = readTapMode()) {
  const first = acts[0]?.line
  return [...(raceHasStart(plan) ? [raceStartId(tap)] : []), ...(first ? [first] : [])]
}
