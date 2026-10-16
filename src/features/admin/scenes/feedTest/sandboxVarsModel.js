import { fillSceneVars, sceneVarNames, tokenizeTemplate, VAR_LIMITS } from '../../../scene/v2/sceneVars.js'
import { pickWordsForScene } from '../../../scene/v2/sceneVarsPick.js'
import { LEVEL_PERM } from '../../../../shared/lib/memory/memoryLevels.js'

// Модель панели «Слова пользователя (проверка)» песочницы: ИМИТАЦИЯ памяти пользователя и подстановка слов в сцену.
// Чистая логика без React и без сети. Настоящий отбор из word_memory — шаг 4 плана (он переиспользует pickWordForVar).
//
// cfg = { memory: [{ text, translation, level 0..4, due }], modes: { [ключ]: { mode, text, translation } } }
//   mode: 'fallback' — запасное слово | 'memory' — слово из имитации памяти по типу отбора | 'manual' — слово вручную.

export const MODES = { fallback: 'Запасное слово', memory: 'Из памяти (имитация)', manual: 'Вручную' }
export const MAX_MEMORY_WORDS = 8

// Фиктивная память по умолчанию: по слову на каждом из 5 уровней стандарта; «просрочено» — у знакомого soup
export const DEFAULT_MEMORY = [
  { text: 'juice', translation: 'сок', level: 0, due: false },
  { text: 'cheese', translation: 'сыр', level: 1, due: false },
  { text: 'soup', translation: 'суп', level: 2, due: true },
  { text: 'tea', translation: 'чай', level: 3, due: false },
  { text: 'bread', translation: 'хлеб', level: 4, due: false },
]

const clip = v => String(v ?? '').slice(0, VAR_LIMITS.maxWord)

export function normalizeMemory(list) {
  if (!Array.isArray(list)) return DEFAULT_MEMORY.map(w => ({ ...w }))
  return list.filter(w => w && typeof w === 'object').slice(0, MAX_MEMORY_WORDS).map(w => {
    const level = Number.isInteger(w.level) && w.level >= 0 && w.level <= LEVEL_PERM ? w.level : 1
    return { text: clip(w.text), translation: clip(w.translation), level, due: level >= 1 && !!w.due }
  })
}

export const defaultMode = () => ({ mode: 'memory', text: '', translation: '' })

export function normalizeCfg(raw) {
  const modes = {}
  const src = raw && typeof raw.modes === 'object' && raw.modes ? raw.modes : {}
  for (const [name, m] of Object.entries(src)) {
    if (m && typeof m === 'object') modes[name] = { mode: m.mode in MODES ? m.mode : 'memory', text: clip(m.text), translation: clip(m.translation) }
  }
  return { memory: normalizeMemory(raw?.memory), modes }
}

export const modeOf = (cfg, name) => cfg.modes[name] ?? defaultMode()

// Первая реплика, где слово name стоит плейсхолдером (в text); -1 — нигде не используется
const lineOf = (scene, name) => (scene.timeline ?? []).findIndex(l => tokenizeTemplate(l?.text).some(t => t.name === name))

// Подстановка «как пользователь»: → { scene (без vars, слова подставлены), values, rows }
// row = { name, source: 'memory' | 'manual' | 'fallback', word: { text, translation? }, level (0..4 | null), note, line, lineRu }
export function buildAsUser(scene, cfg, rng = Math.random) {
  const names = sceneVarNames(scene)
  const memoryVars = Object.fromEntries(names.filter(n => modeOf(cfg, n).mode === 'memory').map(n => [n, scene.vars[n]]))
  const picked = pickWordsForScene(memoryVars, cfg.memory, rng)
  const values = {}
  const meta = {}
  for (const name of names) {
    const m = modeOf(cfg, name)
    const fb = scene.vars[name].fallback
    if (m.mode === 'memory' && picked[name].word) {
      const w = picked[name].word
      values[name] = { text: w.text, ...(w.translation ? { translation: w.translation } : {}) }
      meta[name] = { source: 'memory', word: w, level: w.level, note: 'слово из имитации памяти' }
    } else if (m.mode === 'manual' && m.text.trim()) {
      values[name] = { text: m.text.trim(), ...(m.translation.trim() ? { translation: m.translation.trim() } : {}) }
      meta[name] = { source: 'manual', word: values[name], level: null, note: 'слово введено вручную' }
    } else {
      const note = m.mode === 'memory' ? 'нет слова нужного уровня — показано запасное' : m.mode === 'manual' ? 'слово вручную не заполнено — показано запасное' : 'выбран режим «Запасное слово»'
      meta[name] = { source: 'fallback', word: { text: fb.text, translation: fb.translation }, level: null, note }
    }
  }
  const filled = fillSceneVars(scene, values)
  const rows = names.map(name => {
    const i = lineOf(scene, name)
    return { name, ...meta[name], line: i >= 0 ? filled.timeline[i].text : '', lineRu: i >= 0 ? (filled.timeline[i].translation ?? '') : '' }
  })
  return { scene: filled, values, rows }
}
