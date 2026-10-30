// Что репетиции готовить в тапе «Начать» (wordLaneStart.wordsPlan): озвучку каких слов качать и измерять и какие реплики Пита нужны к самому старту. Раньше тап готовил ВСЁ (все слова плана, двойники, 13 реплик),
// даже когда запускается один этап «Шлифовки» (у «Читки» нужны только три куска фразы) — на телефоне это секунды замершего экрана перед игрой. Чистые функции без React.
import { normText } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { planTexts } from './rehearsalPlan.js'
import { buildActs } from './rehearsalRecipe.js'

export const START_LINE = 'rh_start'  // вступление: Пит говорит про фразу, пока она падает
export const SUMMARY_LINE = 'rh_done' // итог говорит директор актов (useRehearsalActs), у акта summary своей реплики нет

const dedupe = list => { const seen = new Set(); return list.filter(t => { const k = normText(t); if (!k || seen.has(k)) return false; seen.add(k); return true }) }

/**
 * Тексты, озвучку которых готовит тап. Полная репетиция — все (planTexts). Один этап «Шлифовки» (plan.only) — куски фразы и слова только его актов: слова разминки / «слово ×2» / «Без текста» одного слова
 * и слова «Различи» с двойниками (там звучит и запутыватель). Остальным актам (читка, сборка, дубль, зеркало) хватает кусков.
 */
export function neededTexts(plan) {
  if (!plan.only) return planTexts(plan)
  const out = [...plan.chunks]
  for (const a of buildActs(plan).acts) {
    for (const w of a.words ?? []) out.push(w.text, ...(a.id === 'discern' ? w.confusers : []))
    if (a.word) out.push(a.word.text)
  }
  return dedupe(out)
}

/** Говорит ли Пит вступление «Сегодня репетируем одну фразу…» (пока фраза падает). Полная репетиция и «Шлифовка → Заставка» — да; один другой этап «Шлифовки» — нет: вступление (≈ 4,5 с речи) перед каждым запуском одного акта только задерживает то, что шлифуют */
export const hasIntroLine = plan => !plan.only || plan.only === 'intro'

/** Реплики Пита, которые прозвучат в первые секунды: вступление (если есть) и реплика первого акта (у итога — «Отлично, получилось!»). Остальные докачиваются фоном */
export function firstLines(plan) {
  const first = buildActs(plan).acts[0]
  const own = first?.line ?? (first?.id === 'summary' ? SUMMARY_LINE : null)
  return [...(hasIntroLine(plan) ? [START_LINE] : []), ...(own ? [own] : [])]
}
