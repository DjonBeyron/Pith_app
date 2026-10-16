import { isObj } from './sceneConstants.js'
import { candidatesFor, pickWordsForScene, seededRng } from './sceneVarsPick.js'

// Значения слов для сцены-шаблона по списку слов пользователя (loadSceneWords): чистая функция без сети и UI.
// Семантика правил pick (одна и та же в песочнице и в будущей ленте):
//   weak  — «Новые слова»: уровень 1 (шаги памяти 1–2)
//   due   — «Пора повторить»: слово в памяти (уровень 1–4) с просроченным повтором (due_on <= сегодня)
//   known — «Знакомые и выше»: уровни 2–4 (шаги ≥ 3, включая усвоенные и постоянную память)
// Один и тот же seed даёт то же слово при том же списке слов: в песочнице — стабильно до «Перевыбрать»; в ленте seed
// будет «день + id сцены» (sceneSeed), чтобы слово не менялось при каждом открытии.
export const PICK_RULE = { weak: 'уровень 1 (новые)', due: 'просрочен повтор', known: 'уровни 2–4 (знакомые и выше)' }

export const sceneSeed = (sceneId, day) => `${day}:${sceneId ?? ''}`

// → { values: { [name]: { text, translation } } (только выбранные из памяти), report: [{ name, pick, source, word, level,
//     due, candidates, reason }] }. Для слов, которых нет в памяти, values не содержит ключа — fillSceneVars возьмёт запасное.
export function buildSceneValues(scene, words, seed = '') {
  const vars = isObj(scene?.vars) ? scene.vars : {}
  const list = Array.isArray(words) ? words : []
  const picked = pickWordsForScene(vars, list, seededRng(seed))
  const values = {}
  const report = Object.entries(vars).map(([name, def]) => {
    const rule = PICK_RULE[def?.pick] ?? 'неизвестное правило'
    const p = picked[name]
    const candidates = candidatesFor(def, list).length
    if (p?.word) {
      const full = list.find(w => w.text === p.word.text)
      values[name] = { text: p.word.text, ...(p.word.translation ? { translation: p.word.translation } : {}) }
      return { name, pick: def.pick, source: 'memory', word: { ...values[name] }, level: p.word.level, due: !!full?.due, candidates, reason: `правило «${rule}»: подходит слов — ${candidates}, выбрано случайное по зерну` }
    }
    const fb = def?.fallback ?? {}
    const why = def?.pick === 'weak' ? 'у вас в памяти нет слов уровня 1 с переводом' : def?.pick === 'due' ? 'у вас в памяти нет просроченных слов с переводом' : 'у вас в памяти нет слов уровней 2–4 с переводом'
    return { name, pick: def?.pick, source: 'fallback', word: { text: fb.text ?? '', translation: fb.translation ?? '' }, level: null, due: false, candidates, reason: `${why} — показано запасное` }
  })
  return { values, report }
}
