// «Тест игры» → «Репетиция (симуляция)» (Админ → «Голос», GameTestRehearsal.jsx): чистая часть — форма (режим, фикстура, JSON плана) в localStorage админа, разбор JSON в план, строки «есть / нет озвучки» для слов и кусков плана.
import { normalizePlan, planTexts } from './rehearsalPlan.js'
import { FIXTURES, DEFAULT_FIXTURE, fixtureSource } from './rehearsalFixtures.js'
import { wordKey, cleanWordText } from '../../shared/lib/wordAudio/wordKey.js'

export const REHEARSAL_TEST_KEY = 'pithy_wl_rehearsal_v1'
export const MODES = ['node', 'rehearsal']

/** JSON плана для правки в админке (исходник фикстуры, красиво) */
export const fixtureJson = id => JSON.stringify(fixtureSource(id), null, 2)

export const defaultRehearsalForm = () => ({ mode: 'node', fixture: DEFAULT_FIXTURE, json: fixtureJson(DEFAULT_FIXTURE) })

/** Форма из хранилища браузера; нет хранилища / мусор / неизвестная фикстура — значения по умолчанию */
export function loadRehearsalForm(store = globalThis.localStorage) {
  const d = defaultRehearsalForm()
  try {
    const v = JSON.parse(store?.getItem(REHEARSAL_TEST_KEY) ?? 'null')
    const fixture = v?.fixture in FIXTURES ? v.fixture : d.fixture
    return { mode: MODES.includes(v?.mode) ? v.mode : d.mode, fixture, json: typeof v?.json === 'string' && v.json.trim() ? v.json : fixtureJson(fixture) }
  } catch { return d }
}
export function saveRehearsalForm(form, store = globalThis.localStorage) {
  try { store?.setItem(REHEARSAL_TEST_KEY, JSON.stringify(form)) } catch { /* приватный режим — живёт до перезагрузки */ }
}

/** Текст JSON → { plan, error }: нормализованный план или понятная ошибка (не JSON / нет ни одного куска) */
export function parsePlanJson(text) {
  let raw
  try { raw = JSON.parse(text) } catch (e) { return { plan: null, error: `Не JSON: ${e.message}` } }
  const plan = normalizePlan({ ...raw, source: 'sim' })
  return plan ? { plan, error: '' } : { plan: null, error: 'В плане нет ни одного куска: нужен phrase («I\'m | trying | to learn») или chunks' }
}

/** Что озвучивает библиотека слов для плана: куски, слова, двойники, слова фразы — [{ text, key (wordKey или null), has (есть в библиотеке lib: Map key → строка) }] */
export function textRows(plan, lib) {
  return planTexts(plan).map(raw => { const key = wordKey(raw); return { text: cleanWordText(raw), key, has: !!(key && lib?.get(key)) } })
}
