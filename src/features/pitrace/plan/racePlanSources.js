// Загрузка данных для плана «Встряхни память» из памяти (этап 2 «Фразы», CONCEPT_RACE.md → «Данные: план из памяти»): всё нужное параллельно, ошибка одного источника не ломает остальные
// (он просто пустой, причина — в errors). Результат — deps для buildMemoryPlan (racePlanMemory.js). Кэш на 5 минут на пользователя (гость — свой ключ). Все загрузчики подменяются аргументом (тесты, стенд).
//   memory      — word_memory (listWordMemory; гость — память гостя);
//   curricula   — модули = фразы (loadCurricula: id, title, lesson_ids, published, created_at, title_translation, word_translations);
//   lessons     — уроки для слов модулей (listLessonDeckFlags: id, title);
//   startedIds  — начатые модули (fetchStartedModules), phraseRows — закреплённые фразы (listPhraseRows, phrase_memory);
//   audioMap    — app_settings.game2_phrases (озвучка целых фраз), ruMap — app_settings.race_phrase_ru (смысл по-русски от админа),
//                 sceneMap — app_settings.race_phrase_scene (ситуация для круга 1 от админа);
//   wordAudio   — библиотека word_audio (Map, cachedWordAudio; нет кэша — listWordAudio): есть ли озвучка смысла по transKey(ru).
import { listWordMemory, listPhraseRows } from '../../../shared/api/memoryApi.js'
import { viewSession } from '../../../shared/api/viewSession.js'
import { fetchStartedModules } from '../../../shared/api/moduleSocialApi.js'
import { getRacePhraseRu, getRacePhraseScene } from '../../../shared/api/appSettingsApi.js'
import { loadCurricula } from '../../../shared/lib/curriculaApi.js'
import { listLessonDeckFlags } from '../../../shared/lib/lessonsApi.js'
import { cachedWordAudio, listWordAudio } from '../../../shared/lib/wordAudio/wordAudioApi.js'
import { localDate } from '../../../shared/lib/memory/dailyPick.js'
import { getPhrases } from '../../game2/game2Phrase.js'

export const PLAN_TTL_MS = 5 * 60 * 1000

export const DEFAULT_LOADERS = {
  session: viewSession,
  memory: listWordMemory,
  curricula: loadCurricula,
  lessons: listLessonDeckFlags,
  startedIds: async () => [...(await fetchStartedModules())],
  phraseRows: listPhraseRows,
  audioMap: () => getPhrases(),
  ruMap: getRacePhraseRu,
  sceneMap: getRacePhraseScene,
  wordAudio: () => cachedWordAudio() ?? listWordAudio(),
}

const FIELDS = ['memory', 'curricula', 'lessons', 'startedIds', 'phraseRows', 'audioMap', 'ruMap', 'sceneMap', 'wordAudio']
const EMPTY = { memory: [], curricula: [], lessons: [], startedIds: [], phraseRows: [], audioMap: {}, ruMap: {}, sceneMap: {}, wordAudio: null }
const okShape = (field, v) => (field === 'wordAudio' ? v instanceof Map : ['audioMap', 'ruMap', 'sceneMap'].includes(field) ? !!v && typeof v === 'object' && !Array.isArray(v) : Array.isArray(v))

const cache = new Map() // 'guest' | 'user:<id>' → { at, deps }
export const clearPlanDepsCache = () => cache.clear()

/**
 * Данные плана: { now, force, currentId, loaders } → { memory, curricula, lessons, startedIds, phraseRows, audioMap, ruMap, sceneMap, wordAudio, today, who: 'user' | 'guest', errors: ['источник: причина'], currentId }.
 * Никогда не бросает: без сети — пустые источники (план соберётся из запасных фраз).
 */
export async function loadPlanDeps({ now = Date.now(), force = false, currentId = null, loaders = {} } = {}) {
  const L = { ...DEFAULT_LOADERS, ...loaders }
  let user = null
  try { user = (await L.session())?.user ?? null } catch { user = null }
  const who = user ? 'user' : 'guest'
  const cacheKey = user ? `user:${user.id}` : 'guest'
  const hit = cache.get(cacheKey)
  if (!force && hit && now - hit.at < PLAN_TTL_MS) return { ...hit.deps, currentId }
  const settled = await Promise.allSettled(FIELDS.map(f => Promise.resolve().then(() => L[f]())))
  const deps = { ...EMPTY, today: localDate(now), who, errors: [] }
  settled.forEach((r, i) => {
    const f = FIELDS[i]
    if (r.status === 'fulfilled' && okShape(f, r.value)) deps[f] = r.value
    else if (r.status === 'rejected') deps.errors.push(`${f}: ${r.reason?.message || 'ошибка'}`)
    else if (r.value != null) deps.errors.push(`${f}: неверная форма`)
  })
  if (!deps.errors.length) cache.set(cacheKey, { at: now, deps })
  return { ...deps, currentId }
}
