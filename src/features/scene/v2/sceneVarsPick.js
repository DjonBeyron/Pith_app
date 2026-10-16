import { isObj } from './sceneConstants.js'
import { LEVEL_PERM } from '../../../shared/lib/memory/memoryLevels.js'

// Выбор слова пользователя для одного «слова» шаблона сцены (vars) — чистая логика без UI и без сети.
// Сейчас её зовёт только песочница админки (имитация памяти); шаг 4 переиспользует её с настоящей памятью:
// достаточно привести строки word_memory к виду { text, translation?, level, due? } (level — levelOfWord из memoryLevels).
//
// memory — список слов: { text, translation?, level (0..4), due? }.
//   weak  — «Новые слова»: уровень 1 (шаги 1–2)
//   due   — «Пора повторить»: слово в памяти (уровень ≥ 1) с флагом due (повтор просрочен)
//   known — «Знакомые и выше»: уровни 2–4 (шаги ≥ 3, включая постоянную память)
// Слова уровня 0 (временные, вне word_memory) не подходят ни одному типу отбора.

const inRange = (level, a, b) => Number.isInteger(level) && level >= a && level <= b

export const PICK_TEST = {
  weak: w => inRange(w.level, 1, 1),
  due: w => inRange(w.level, 1, LEVEL_PERM) && !!w.due,
  known: w => inRange(w.level, 2, LEVEL_PERM),
}

const usable = w => isObj(w) && typeof w.text === 'string' && w.text.trim() !== ''

// Слова памяти, подходящие типу отбора def.pick (неизвестный pick — никакие)
export function candidatesFor(def, memory) {
  const test = PICK_TEST[def?.pick]
  return test && Array.isArray(memory) ? memory.filter(w => usable(w) && test(w)) : []
}

// Детерминированный генератор [0, 1) по строке-зерну (mulberry32 + хэш строки): одно зерно — одна последовательность
export function seededRng(seed) {
  let h = 1779033703
  const s = String(seed ?? '')
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19) }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Выбрать слово: { source: 'memory', word: { text, translation?, level } } | { source: 'fallback', word: null }.
// exclude — слова (text), уже занятые другими словами сцены: одно слово не ставится дважды, пока есть другие подходящие;
// если подходящее только занятое — берётся оно (лучше повтор, чем запасное). rng() → [0, 1), по умолчанию Math.random.
export function pickWordForVar(def, memory, rng = Math.random, exclude = []) {
  const all = candidatesFor(def, memory)
  const taken = new Set(exclude.map(x => String(x).trim().toLowerCase()))
  const free = all.filter(w => !taken.has(w.text.trim().toLowerCase()))
  const pool = free.length ? free : all
  if (!pool.length) return { source: 'fallback', word: null }
  const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length))
  const { text, translation, level } = pool[i]
  return { source: 'memory', word: { text: text.trim(), ...(translation ? { translation } : {}), level } }
}

// Слова для всех переменных сцены по порядку: { [name]: pickWordForVar(...) }; занятые слова не повторяются
export function pickWordsForScene(vars, memory, rng = Math.random) {
  const out = {}
  const used = []
  for (const [name, def] of Object.entries(isObj(vars) ? vars : {})) {
    out[name] = pickWordForVar(def, memory, rng, used)
    if (out[name].word) used.push(out[name].word.text)
  }
  return out
}
