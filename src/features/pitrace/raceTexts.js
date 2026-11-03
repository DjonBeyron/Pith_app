// Что «Гонке с Питом» готовить в тапе «Начать» (wordLaneStart.wordsPlan): озвучку каких слов качать и измерять и какие реплики Пита нужны к самому старту. Чистые функции без React.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { planTexts } from '../rehearsal/rehearsalPlan.js'
import { extrasOf } from './raceWords.js'

/** Тексты, которые должна озвучить библиотека слов: куски, слова плана, двойники, слова фразы и добор «Разгона» (слова других планов); у раунда (plan.round) — всё то же: слова раундов пересекаются */
export function raceTexts(plan) {
  const seen = new Set()
  return [...planTexts(plan), ...extrasOf(plan).flatMap(w => [w.text, ...(w.confusers ?? [])])].filter(t => { const k = normText(t); if (!k || seen.has(k)) return false; seen.add(k); return true })
}

/** Первые реплики гонки: старт (если не один раунд) и реплика первого акта — к самому старту ждём только их */
export function raceFirstLines(plan, acts) {
  const first = acts[0]?.line
  return [...(plan.round ? [] : ['race_start']), ...(first ? [first] : [])]
}
