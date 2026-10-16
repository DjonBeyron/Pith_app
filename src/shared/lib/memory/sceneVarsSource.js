import { listWordMemory } from '../../api/memoryApi.js'
import { viewSession } from '../../api/viewSession.js'
import { loadCurricula } from '../curriculaApi.js'
import { wordKey } from '../wordAudio/wordKey.js'
import { levelOfWord, LEVEL_PERM } from './memoryLevels.js'
import { localDate } from './dailyPick.js'

// Источник слов пользователя для сцен-шаблонов (vars): память (word_memory либо память гостя) + переводы модулей.
// Только ЧТЕНИЕ: ничего не пишет и не меняет. Отбор слова под правило сцены — pickWordsForScene (scene/v2/sceneVarsPick.js),
// сборка значений — buildSceneValues (scene/v2/sceneVarsValues.js); сюда они не смотрят.
//
// Слово: { key, text, translation, level (1..4), due, step }
//   key/text — английское слово в нижнем регистре (ключ word_memory = wordKey урока-слова; в нижнем регистре и показываем)
//   due      — повтор просрочен или назначен на сегодня (due_on <= локальная дата устройства, как pickToday/learnView)
//
// Решения:
//  - перевод в памяти не хранится: берём из curricula.word_translations ОПУБЛИКОВАННЫХ модулей; если у слова в разных
//    модулях разные переводы — берём из модуля с наименьшим id (детерминированно, от порядка загрузки не зависит);
//  - годятся только слова без пробелов: латинские буквы и апостроф внутри (don't); фразы, цифры, дефисы — нет; длина ≤ 24;
//  - слово без перевода или с переводом длиннее лимита сцены не используется (а в сводке считается отдельно).

export const WORD_MAX_LEN = 24
export const TRANSLATION_MAX_LEN = 40
export const WORDS_TTL_MS = 5 * 60 * 1000
const SIMPLE_WORD = /^[a-z]+(?:'[a-z]+)*$/

const cache = new Map() // ключ пользователя ('guest' | user id) → { at, result }
export const clearSceneWordsCache = () => cache.clear()

// Карта слово → перевод по строкам curricula (только опубликованные; модули по возрастанию id)
export function translationMap(curricula) {
  const map = new Map()
  const mods = (Array.isArray(curricula) ? curricula : []).filter(m => m?.published).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  for (const m of mods) {
    for (const e of Array.isArray(m.word_translations) ? m.word_translations : []) {
      const key = wordKey(e?.w)
      const t = String(e?.t ?? '').trim()
      if (key && t && !map.has(key)) map.set(key, t)
    }
  }
  return map
}

// Чистая сборка: строки word_memory + переводы → { words, stats }. stats — для сводки в админке
export function buildSceneWords(memoryRows, curricula, today) {
  const tr = translationMap(curricula)
  const stats = { total: 0, usable: 0, noTranslation: 0, notSimple: 0, due: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0 } }
  const seen = new Set()
  const words = []
  for (const row of Array.isArray(memoryRows) ? memoryRows : []) {
    const key = wordKey(row?.word)
    if (!key || seen.has(key)) continue
    seen.add(key)
    stats.total++
    const level = levelOfWord(row)
    if (level < 1 || level > LEVEL_PERM) continue
    if (key.length > WORD_MAX_LEN || !SIMPLE_WORD.test(key)) { stats.notSimple++; continue }
    const translation = tr.get(key)
    if (!translation || translation.length > TRANSLATION_MAX_LEN) { stats.noTranslation++; continue }
    const due = !!row.due_on && row.due_on <= today
    words.push({ key, text: key, translation, level, due, step: row.step ?? null })
    stats.usable++
    stats.byLevel[level]++
    if (due) stats.due++
  }
  return { words, stats }
}

const EMPTY_STATS = { total: 0, usable: 0, noTranslation: 0, notSimple: 0, due: 0, byLevel: { 1: 0, 2: 0, 3: 0, 4: 0 } }

// ctx (всё необязательно, для тестов): { now (ms), force, listMemory, loadModules, session }
// → { words, stats, source: 'user' | 'guest', error: string | null }. Ошибка сети не бросается.
export async function loadSceneWords(ctx = {}) {
  const { now = Date.now(), force = false, listMemory = listWordMemory, loadModules = loadCurricula, session = viewSession } = ctx
  try {
    const user = (await session())?.user
    const source = user ? 'user' : 'guest'
    const cacheKey = user ? `user:${user.id}` : 'guest'
    const hit = cache.get(cacheKey)
    if (!force && hit && now - hit.at < WORDS_TTL_MS) return hit.result
    const [memory, curricula] = await Promise.all([listMemory(), loadModules()])
    const result = { ...buildSceneWords(memory, curricula, localDate(now)), source, error: null }
    cache.set(cacheKey, { at: now, result })
    return result
  } catch (e) {
    return { words: [], stats: { ...EMPTY_STATS, byLevel: { ...EMPTY_STATS.byLevel } }, source: null, error: e?.message || 'не удалось загрузить память' }
  }
}
