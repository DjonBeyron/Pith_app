// Админка «Смысл фразы» (CONCEPT_RACE.md, «Этап 2» → «Смысл фразы (админка)»): чистые функции без React. Смысл — русское НАМЕРЕНИЕ фразы («скажи, что рад знакомству»), не перевод:
// его Пит говорит в круге 2 «Скажи» / «Узнай». Ситуация — контекст без подсказки слов («ты знакомишься с новым человеком»), её Пит говорит в круге 1 «Пойми».
// Хранятся в app_settings.race_phrase_ru и app_settings.race_phrase_scene как { [key]: text }, key = normText английской фразы (как plan.phrases[].key в контракте этапа 2).
import { normText } from '../../player/modules/rotate-phone/wordLaneRecipe.js'

export const RACE_PHRASE_RU_KEY = 'race_phrase_ru'
export const RACE_PHRASE_SCENE_KEY = 'race_phrase_scene'
export const MEANING_HINT = 'скажи, что рад знакомству'
export const SCENE_HINT = 'ты знакомишься с новым человеком'

/** Значение настройки → { [key]: text } только со строками (битая строка / null — пусто) */
export function meaningMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([k, v]) => k && typeof v === 'string' && v.trim()).map(([k, v]) => [k, v.trim()]))
}

/**
 * Строки списка: [{ key, text, ru, scene, byWords }] — фразы плана (plan.phrases), а если их ещё нет — фраза урока (plan.phrase без «|»).
 * ru — сохранённый смысл (saved[key]), иначе смысл из плана; scene — сохранённая ситуация (savedScene[key]), иначе из плана;
 * byWords — у фразы нет целой озвучки (audio === null): Пит читает её по словам.
 */
export function meaningRows(plan, saved = {}, savedScene = {}) {
  const list = Array.isArray(plan?.phrases) && plan.phrases.length
    ? plan.phrases.map(p => ({ key: p.key || normText(p.text), text: p.text ?? '', ru: p.ru ?? '', scene: p.scene ?? '', byWords: p.audio === null }))
    : plan?.phrase ? [{ text: String(plan.phrase).replace(/\s*\|\s*/g, ' ').trim(), ru: '', scene: '', byWords: false }].map(r => ({ ...r, key: normText(r.text) })) : []
  const seen = new Set()
  return list.filter(r => r.key && !seen.has(r.key) && seen.add(r.key)).map(r => ({ ...r, ru: saved[r.key] ?? r.ru, scene: savedScene?.[r.key] ?? r.scene }))
}

/** Сохранённое + правки (drafts: { [key]: text }) → новая карта; пустой текст убирает ключ, чужие ключи (другие уроки) остаются */
export function mergeMeanings(saved, drafts) {
  const next = { ...meaningMap(saved) }
  for (const [k, v] of Object.entries(drafts ?? {})) {
    const t = String(v ?? '').trim()
    if (t) next[k] = t
    else delete next[k]
  }
  return next
}

/** Есть ли несохранённые правки */
export const isDirty = (saved, drafts) => Object.entries(drafts ?? {}).some(([k, v]) => String(v ?? '').trim() !== (saved?.[k] ?? ''))

/** Тексты смыслов и ситуаций для озвучки (ключ озвучки — transKey(текст), raceTrans.js) */
export const meaningTexts = rows => rows.flatMap(r => [r.ru, r.scene]).filter(t => String(t ?? '').trim())
