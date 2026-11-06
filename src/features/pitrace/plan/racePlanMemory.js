// План «Встряхни память» из памяти (этап 2 «Фразы», CONCEPT_RACE.md → «Данные: план из памяти»): buildMemoryPlan({ base, deps }) → { ...base, game: 'race', source: 'memory', extraWords, phrases }.
// base — план урока (фраза, куски, слова, семя; на стенде — фикстура), deps — загруженные данные (racePlanSources.loadPlanDeps). Чистая функция: без сети, случайность — только от семени плана.
// Движок только читает plan.phrases / plan.extraWords; нормализацию полей делает normalizePlan (rehearsalPlan.js → racePhraseNorm.js).
import { buildPhrases, buildExtraWords } from './racePhrasePool.js'

export function buildMemoryPlan({ base, deps = {} } = {}) {
  const b = base && typeof base === 'object' ? base : {}
  const phrases = buildPhrases({ base: b, deps })
  const extraWords = buildExtraWords({ base: b, deps })
  return { ...b, game: 'race', source: 'memory', extraWords, phrases }
}
