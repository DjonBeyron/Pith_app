// Рецепт «Репетиции с Питом» (CONCEPT_REHEARSAL.md §3 и решения владельца §6): из плана — список АКТОВ со ступенями. Чистые функции, без React и DOM; в стадии рецепт раскладывает rehearsalStages.js.
//  0 заставка       — падает фраза, открываются дорожки (это вступление директора, в списке актов её нет);
//  1 warmup         — разминка: ТОЛЬКО слова с карточкой (перевод есть), без служебных слов (to, a, the …), «к повтору» первыми; над дорожкой слова ПЕРЕВОД, цель — слово (у одного слова — act word: «слово ×2» вместо разминки и сборки). Нет таких слов — акта нет;
//  2 discern        — различи (v3.3.87: сразу после разминки): только у слов с двойниками; всегда три дорожки (слово и два других: двойники, нехватку добирают слова фразы); Пит объясняет задание (rh_discern), слово звучит один раз при трёх дорожках на экране, тап по услышанному, потом сказать слово. Правила «много промахов» к нему не относятся: пропуск только если двойников нет;
//  3 build          — сборка с конца [2] → [1,2] → [0,1,2]: диктор ×1, человек ×1, промах — ступень ещё раз (не больше одного повтора); последняя ступень — человек ×2: «чётко» → «обычно» (§6 п. 1, 4; порядок фиксирован);
//  4 read           — читка (v3.3.87: после сборки): диктор говорит всю фразу из кусков библиотеки, слова фразы заливаются зелёным в такт его голосу (караоке, readKaraoke.js), потом человек повторяет один раз, заливка идёт за его голосом; Пит говорит, зачем это (§6 п. 2);
//  5 blind          — без текста: подписей и перевода нет, фраза ×2 (второй раз — только если промахов к этому акту меньше MANY_MISSES); застрял 3 с — Пит подсказывает первое слово;
//  6 take / mirror  — дубль (плашка «Дубль», отсчёт тремя нотами, «поехали», вся фраза ×1 и запись голоса — useRehearsalTake) и зеркало (сравнение на дорожках «Пит / Ты» и одна заметка — модуль mirror/);
//  7 summary        — итог.
// Случайность ВНУТРИ актов (CONCEPT_REHEARSAL.md §8, семя plan.seed — rehearsalSeed.js; что именно выбирается — rehearsalVariety.js, rehearsalDiscern.js, rehearsalLines.js): порядок слов разминки (первое — самое просроченное) и их дорожки,
// реплики Пита (act.line — уже конкретный вариант ключа), первая ступень сборки при двух кусках, подсказки «без текста», раскладка «Различи». Порядок актов, структура ступеней при трёх кусках и зеркало последним — не случайны.
// Правила пропуска: нет озвучки кусков — читка без заливки под голос Пита; промахов ≥ MANY_MISSES к акту «без текста» — он один раз; нет двойников — нет «Различи»; нет слов с карточкой — нет разминки; одно слово — разминка и сборка схлопываются в «слово ×2», читки нет.
import { warmupWords, discernWords, phraseWords, wordsOfChunk } from './rehearsalPlan.js'
import { pickActs } from './rehearsalOnly.js'
import { sessionLine } from './rehearsalLines.js'
import { orderWarmup, buildVariety, blindVariety } from './rehearsalVariety.js'
import { discernLayout } from './rehearsalDiscern.js'

export const MANY_MISSES = 3                       // столько промахов до акта «без текста» — и он сокращается
export const PRE_BLIND_ACTS = ['warmup', 'word', 'read', 'build']  // акты, чьи промахи считаются «к акту без текста»
export const CLEAR_TAG = 'Чётко — для последнего ряда'
export const NORMAL_TAG = 'Обычно'

/** Куски по номерам: [2], [1,2], [0,1,2] — ступени сборки с конца; последняя (вся фраза) — final */
export function backSteps(n) {
  const out = []
  for (let from = n - 1; from >= 0; from--) out.push(Array.from({ length: n - from }, (_, k) => from + k))
  return out
}

/**
 * @param {object} plan — нормализованный RehearsalPlan
 * @param {{ hasVoice?: boolean, only?: string }} o — hasVoice: хотя бы один кусок озвучен в библиотеке (без озвучки читка идёт без подсветки); only: этап шлифовки (rehearsalOnly.js) — оставить акты только его (по умолчанию plan.only)
 * @returns {{ plan, acts: object[] }}
 */
export function buildActs(plan, { hasVoice = true, only = plan.only } = {}) {
  const { chunks } = plan
  const n = chunks.length
  const all = chunks.map((_, i) => i)
  const words = orderWarmup(warmupWords(plan), plan.seed, { center: n === 1 }) // первое — самое просроченное, остальные вперемешку; дорожки случайные (у одного слова — по центру)
  const pool = [...phraseWords(chunks), ...plan.words.flatMap(x => x.confusers)] // чем добить «Различи» до трёх дорожек, если у слова меньше двух двойников
  const discern = discernWords(plan).map((w, i) => ({ ...w, prompts: discernLayout(w, plan.seed, i, pool) }))
  const L = base => sessionLine(plan, base) // вариант реплики на эту сессию (rehearsalLines.js)
  const acts = []
  const discernAct = discern.length ? { id: 'discern', title: 'Различи', line: 'rh_discern', words: discern } : null // сразу после разминки; пропуск только если у слов нет двойников
  if (n === 1) {
    if (words.length) acts.push({ id: 'word', title: 'Слово', line: L('rh_warmup'), words, reps: 2 })
    if (discernAct) acts.push(discernAct)
  } else {
    if (words.length) acts.push({ id: 'warmup', title: 'Разминка', line: L('rh_warmup'), words, reps: 1 })
    if (discernAct) acts.push(discernAct)
    const bv = buildVariety(n, plan.seed)
    const steps = backSteps(n)
    const final = steps.pop()
    const passes = [{ id: 'build-clear', tag: CLEAR_TAG, line: L('rh_clear') }, { id: 'build-normal', tag: NORMAL_TAG, line: L('rh_normal') }] // всегда «чётко», потом «обычно»: реплика «обычно» начинается с «И ещё раз»
    acts.push({
      id: 'build', title: 'Сборка с конца', line: L('rh_build'),
      steps: steps.map((parts, i) => ({ id: `build-${i}`, parts: bv.altStart ? [0] : parts, retry: true })), // два куска: первая ступень [1] или [0]; три — всегда [2] → [1,2]
      final: { id: 'build-final', parts: final, passes },
    })
    acts.push({ id: 'read', title: 'Читка', line: L('rh_read_why'), parts: all, highlight: !!hasVoice }) // после сборки: фраза уже собрана, теперь ритм целиком
  }
  const first = wordsOfChunk(chunks[0])[0] ?? chunks[0]
  const bl = blindVariety(plan)
  acts.push({
    id: 'blind', title: 'Без текста', line: L('rh_blind'), parts: all, hintWord: first, hintLane: 0, hintTr: bl.tr,
    word: n === 1 ? words[0] : null, // у одного слова — слово по переводу (а не по памяти без подсказок)
    passes: n === 1 ? [{ id: 'blind-0' }] : [{ id: 'blind-0', hintKinds: bl.kinds }, { id: 'blind-1', cond: { few: true }, hintKinds: bl.reversed }], // «застрял»: какая подсказка первая — случайно, во втором проходе наоборот
  })
  acts.push({ id: 'take', title: 'Дубль', line: L('rh_take'), parts: all })
  acts.push({ id: 'mirror', title: 'Зеркало', line: L('rh_mirror') })
  acts.push({ id: 'summary', title: 'Итог' })
  return { plan, acts: pickActs(acts, only) } // only: «Шлифовка репетиции» — один этап вместо всего сценария
}
