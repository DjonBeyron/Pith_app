// Одна фраза плана «Встряхни память» (этап 2 «Фразы», контракт plan.phrases — CONCEPT_RACE.md, «Данные: план из памяти»): модуль curricula → { id, text, key, words, ru, own, level, audio }. Чистые функции без сети.
//   words — слова модуля: lesson_ids.slice(1, -1) → wordKey(lesson.title) (как learnView.js); уроков нет (без сети) — слова из word_translations, нет и их — слова названия;
//   translation — из curricula.word_translations, level — levelOfWord(строка word_memory) (нет строки — 0);
//   ru — смысл по-русски: app_settings.race_phrase_ru[key] → curricula.title_translation → '';
//   audio — целая фраза: app_settings.game2_phrases['rh2_phrase:' + key] ({ url, duration }), нет файла — null (Пит читает по словам).
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'
import { wordKey } from '../../../shared/lib/wordAudio/wordKey.js'
import { levelOfWord } from '../../../shared/lib/memory/memoryLevels.js'

export const PHRASE_AUDIO_PREFIX = 'rh2_phrase:' // тот же ключ, что game2Phrase.phraseKey (игра 2.0 озвучивает целые фразы)
const clean = (v, n = 160) => String(v ?? '').trim().slice(0, n)

/** Карта перевода слов одного модуля: слово → перевод */
export function moduleTranslations(mod) {
  return new Map((Array.isArray(mod?.word_translations) ? mod.word_translations : []).map(e => [wordKey(e?.w), clean(e?.t, 80)]).filter(([k, v]) => k && v))
}

/** Перевод слов по всем ОПУБЛИКОВАННЫМ модулям (по возрастанию id, первый перевод слова побеждает) — те же правила, что sceneVarsSource.translationMap (свой экземпляр: план не тянет за собой API памяти) */
export function allTranslations(curricula) {
  const map = new Map()
  const mods = (Array.isArray(curricula) ? curricula : []).filter(m => m?.published).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  for (const m of mods) for (const [k, v] of moduleTranslations(m)) if (!map.has(k)) map.set(k, v)
  return map
}

/** Слова модуля по порядку (ключи wordKey, без повторов); lessonById — Map id → { title } */
export function moduleWordKeys(mod, lessonById) {
  const ids = Array.isArray(mod?.lesson_ids) && mod.lesson_ids.length > 2 ? mod.lesson_ids.slice(1, -1) : []
  const fromLessons = ids.map(id => wordKey(lessonById?.get(id)?.title)).filter(Boolean)
  const list = fromLessons.length ? fromLessons
    : (Array.isArray(mod?.word_translations) && mod.word_translations.length ? mod.word_translations.map(e => wordKey(e?.w)) : normText(mod?.title).split(' ').map(wordKey))
  return [...new Set(list.filter(Boolean))]
}

/** Озвучка целой фразы из карты game2_phrases: { url, duration } | null */
export function phraseAudio(audioMap, key) {
  const e = audioMap?.[`${PHRASE_AUDIO_PREFIX}${key}`]
  if (!e || typeof e.url !== 'string' || !e.url) return null
  return { url: e.url, duration: Number(e.duration) > 0 ? Number(e.duration) : null }
}

/** Смысл по-русски: race_phrase_ru[key] → перевод названия → '' */
export const phraseRu = (ruMap, key, fallback) => clean(ruMap?.[key]) || clean(fallback)

/** Минимум уровней слов (нет слов — 0) */
export const phraseLevel = words => (words.length ? Math.min(...words.map(w => w.level)) : 0)

/**
 * Фраза из модуля. ctx: { lessonById: Map, memByWord: Map слово → строка word_memory, ruMap, audioMap, own }.
 * Возвращает null, если у модуля нет названия.
 */
export function phraseOfModule(mod, ctx = {}) {
  const text = clean(mod?.title, 120)
  const key = normText(text)
  if (!key) return null
  const tr = moduleTranslations(mod)
  const words = moduleWordKeys(mod, ctx.lessonById).map(w => ({ text: w, translation: tr.get(w) ?? '', level: levelOfWord(ctx.memByWord?.get(w) ?? null) }))
  return { id: String(mod.id), text, key, words, ru: phraseRu(ctx.ruMap, key, mod.title_translation), own: !!ctx.own, level: phraseLevel(words), audio: phraseAudio(ctx.audioMap, key) }
}

/**
 * Фраза из самого плана (фраза урока не нашлась среди модулей — например, фикстура стенда): слова — слова кусков, переводы — из plan.words,
 * смысл — race_phrase_ru → plan.translation. id — 'plan:' + key.
 */
export function phraseOfPlan(base, ctx = {}) {
  const text = clean((Array.isArray(base?.chunks) && base.chunks.length ? base.chunks.join(' ') : String(base?.phrase ?? '').split('|').join(' ')).replace(/\s+/g, ' '), 120)
  const key = normText(text)
  if (!key) return null
  const cards = new Map((base?.words ?? []).map(w => [wordKey(w.text), w.translation ?? '']))
  const keys = [...new Set(text.split(' ').map(wordKey).filter(Boolean))]
  const words = keys.map(w => ({ text: w, translation: clean(cards.get(w), 80), level: levelOfWord(ctx.memByWord?.get(w) ?? null) }))
  return { id: `plan:${key}`, text, key, words, ru: phraseRu(ctx.ruMap, key, base?.translation), own: true, level: phraseLevel(words), audio: phraseAudio(ctx.audioMap, key) }
}
