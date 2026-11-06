// Сводка плана «Встряхни память» для стенда и журнала (этап 2 «Фразы», CONCEPT_RACE.md → «Данные: план из памяти»): сколько слов памяти, своих и дежурных фраз, у каких фраз нет смысла, озвучки фразы
// или озвучки смысла (word_audio по transKey(ru), raceTrans.js). Одна строка журнала «[plan] …» (planLogLine). Чистые функции.
import { transKey } from '../raceTrans.js'

const list = names => (names.length ? names.join(', ') : '—')

/** plan — план (после buildMemoryPlan или фикстура), deps — данные (racePlanSources.loadPlanDeps) или null */
export function summarizePlan(plan, deps = null) {
  const phrases = Array.isArray(plan?.phrases) ? plan.phrases : []
  const lib = deps?.wordAudio instanceof Map ? deps.wordAudio : null
  return {
    source: plan?.source === 'memory' ? 'memory' : 'fixture',
    memoryWords: Array.isArray(deps?.memory) ? deps.memory.length : 0,
    extraWords: Array.isArray(plan?.extraWords) ? plan.extraWords.length : 0,
    phrases: phrases.length,
    own: phrases.filter(p => p.own).length,
    standby: phrases.filter(p => !p.own).length,
    noRu: phrases.filter(p => !p.ru).map(p => p.text),
    noAudio: phrases.filter(p => !p.audio).map(p => p.text),
    noRuVoice: lib ? phrases.filter(p => p.ru && !lib.get(transKey(p.ru))?.url).map(p => p.text) : [],
    errors: Array.isArray(deps?.errors) ? deps.errors : [],
  }
}

/** Короткая сводка для стенда: «слов памяти 14 · фраз 4 (свои 1, дежурные 3)» */
export const summaryText = s => `слов памяти ${s.memoryWords} · добор ${s.extraWords} · фраз ${s.phrases} (свои ${s.own}, дежурные ${s.standby})`

/** Строка журнала: «[plan] источник: память · N слов · M фраз (свои / дежурные) · без смысла: … · без озвучки фразы: … · без озвучки смысла: … · ошибки: …» */
export function planLogLine(s) {
  const src = s.source === 'memory' ? 'память' : 'фикстура'
  const parts = [`[plan] источник: ${src}`, `${s.memoryWords} слов памяти, добор ${s.extraWords}`, `${s.phrases} фраз (свои ${s.own} / дежурные ${s.standby})`]
  if (s.source === 'memory') parts.push(`без смысла: ${list(s.noRu)}`, `без озвучки фразы: ${list(s.noAudio)}`, `без озвучки смысла: ${list(s.noRuVoice)}`)
  if (s.errors.length) parts.push(`ошибки: ${s.errors.join('; ')}`)
  return parts.join(' · ')
}
