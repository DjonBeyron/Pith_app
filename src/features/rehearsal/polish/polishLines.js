// Реплики Пита по этапам «Шлифовки репетиции»: какие реплики (rehearsalLines.js) звучат на каком этапе, сколько из них озвучено и что без озвучки (и почему). Озвучка живёт в настройках приложения (rotate_cat_lines,
// формат — wordLaneCatLines.js), здесь только чтение: lines — normalizeLines(...) или null (ещё не загрузили). Чистые функции без React.
import { REHEARSAL_LINES, lineVariants } from '../rehearsalLines.js'

/** Этап шлифовки → основные ключи реплик, которые Пит говорит на нём (по рецепту rehearsalRecipe.js и useRehearsalActs.js) */
const BASE_LINES = {
  intro: ['rh_start'],
  warmup: ['rh_warmup', 'rh_warmup_miss'],
  read: ['rh_read_why'],
  build: ['rh_build', 'rh_clear', 'rh_normal'],
  blind: ['rh_blind', 'rh_blind_hint'],
  discern: ['rh_discern'],
  take: ['rh_take', 'rh_mirror'],
  summary: ['rh_done'],
}

/** Этап шлифовки → ключи реплик ВМЕСТЕ с вариантами (rh_done, rh_done_b, rh_done_c): какой прозвучит в сессии, выбирает семя плана (CONCEPT_REHEARSAL.md §8), озвучиваются и слушаются все */
export const ACT_LINES = Object.fromEntries(Object.entries(BASE_LINES).map(([act, ids]) => [act, ids.flatMap(lineVariants)]))

export const TEMPLATE_WHY = '{word} не озвучивается: Пит произносит само слово из библиотеки слов'
export const MISSING_WHY = 'нет озвучки: нажми «Озвучить реплики (ElevenLabs)»'

/** Реплика с состоянием: { id, act, text, when, template ({word} в тексте), url, state ('ok' | 'missing' | 'template'), why } */
function row(def, act, lines) {
  const template = def.text.includes('{')
  const url = lines?.[def.id]?.url ?? null
  const state = template ? 'template' : url ? 'ok' : 'missing'
  return { id: def.id, act, text: lines?.[def.id]?.text ?? def.text, when: def.when, template, url, state, why: state === 'template' ? TEMPLATE_WHY : state === 'missing' ? MISSING_WHY : '' }
}

const ACT_OF = Object.fromEntries(Object.entries(ACT_LINES).flatMap(([act, ids]) => ids.map(id => [id, act])))

/** Все реплики репетиции с состоянием, в порядке каталога */
export const allLineRows = lines => REHEARSAL_LINES.map(d => row(d, ACT_OF[d.id] ?? null, lines))

/** Реплики одного этапа */
export const actLineRows = (act, lines) => allLineRows(lines).filter(r => r.act === act)

/** Сколько озвучено на этапе: { done, total (озвучиваемых), templates (с {word}, не озвучиваются) } */
export function actVoiceCount(act, lines) {
  const rows = actLineRows(act, lines)
  const voiced = rows.filter(r => !r.template)
  return { done: voiced.filter(r => r.url).length, total: voiced.length, templates: rows.length - voiced.length }
}

/** Реплики без озвучки с причиной (в том числе те, что озвучить нельзя) */
export const unvoicedRows = lines => allLineRows(lines).filter(r => r.state !== 'ok')

/** Куски и слова плана (textRows из rehearsalTestForm.js) → { done, total } среди тех, что вообще озвучиваются библиотекой слов (есть ключ) */
export function chunkCount(rows) {
  const voiced = rows.filter(r => r.key)
  return { done: voiced.filter(r => r.has).length, total: voiced.length }
}
