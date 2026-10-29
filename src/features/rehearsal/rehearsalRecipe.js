// Рецепт «Репетиции с Питом» (CONCEPT_REHEARSAL.md §3 и решения владельца §6): из плана — список АКТОВ со ступенями. Чистые функции, без React и DOM; в стадии рецепт раскладывает rehearsalStages.js.
//  0 заставка       — падает фраза, открываются дорожки (это вступление директора, в списке актов её нет);
//  1 warmup         — разминка: по слову «к повтору», над дорожкой слова ПЕРЕВОД, цель — слово (у одного слова — act word: «слово ×2» вместо разминки и сборки);
//  2 read           — читка: диктор говорит всю фразу из кусков библиотеки, куски подсвечиваются по очереди, потом человек повторяет один раз; Пит говорит, зачем это (§6 п. 2);
//  3 build          — сборка с конца [2] → [1,2] → [0,1,2]: диктор ×1, человек ×1, промах — ступень ещё раз (не больше одного повтора); последняя ступень — человек ×2: «чётко» → «обычно» (§6 п. 1, 4);
//  4 blind          — без текста: подписей и перевода нет, фраза ×2 (второй раз — только если промахов к этому акту меньше MANY_MISSES); застрял 3 с — Пит подсказывает первое слово;
//  4a discern       — различи: только у слов с двойниками, только если промахов мало; тап по услышанному, потом сказать слово;
//  5 take / mirror  — дубль (плашка «Дубль. Три, два, один…», вся фраза ×1 и запись голоса — useRehearsalTake) и зеркало (экран сравнения «Пит / Ты» и одна заметка — модуль mirror/);
//  6 summary        — итог.
// Правила пропуска: нет озвучки кусков — читка без подсветки; промахов ≥ MANY_MISSES к акту 4 — акт 4 один раз и без 4а; одно слово — акты 1 и 3 схлопываются в «слово ×2», акт 2 пропускается.
import { warmupWords, discernWords, wordsOfChunk } from './rehearsalPlan.js'

export const MANY_MISSES = 3                       // столько промахов до акта 4 — и он сокращается, а «Различи» пропускается
export const PRE_BLIND_ACTS = ['warmup', 'word', 'read', 'build']  // акты, чьи промахи считаются «к акту 4»
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
 * @param {{ hasVoice?: boolean }} o — hasVoice: хотя бы один кусок озвучен в библиотеке (без озвучки читка идёт без подсветки)
 * @returns {{ plan, acts: object[] }}
 */
export function buildActs(plan, { hasVoice = true } = {}) {
  const { chunks } = plan
  const n = chunks.length
  const all = chunks.map((_, i) => i)
  const words = warmupWords(plan)
  const discern = discernWords(plan)
  const acts = []
  if (n === 1) {
    acts.push({ id: 'word', title: 'Слово', line: 'rh_warmup', words, reps: 2 })
  } else {
    acts.push({ id: 'warmup', title: 'Разминка', line: 'rh_warmup', words, reps: 1 })
    acts.push({ id: 'read', title: 'Читка', line: 'rh_read_why', parts: all, highlight: !!hasVoice })
    const steps = backSteps(n)
    const final = steps.pop()
    acts.push({
      id: 'build', title: 'Сборка с конца', line: 'rh_build',
      steps: steps.map((parts, i) => ({ id: `build-${i}`, parts, retry: true })),
      final: { id: 'build-final', parts: final, passes: [{ id: 'build-clear', tag: CLEAR_TAG, line: 'rh_clear' }, { id: 'build-normal', tag: NORMAL_TAG, line: 'rh_normal' }] },
    })
  }
  const first = wordsOfChunk(chunks[0])[0] ?? chunks[0]
  acts.push({
    id: 'blind', title: 'Без текста', line: 'rh_blind', parts: all, hintWord: first, hintLane: 0,
    word: n === 1 ? words[0] : null, // у одного слова — слово по переводу (а не по памяти без подсказок)
    passes: n === 1 ? [{ id: 'blind-0' }] : [{ id: 'blind-0' }, { id: 'blind-1', cond: { few: true } }],
  })
  if (discern.length) acts.push({ id: 'discern', title: 'Различи', line: 'rh_discern', words: discern, cond: { few: true } })
  acts.push({ id: 'take', title: 'Дубль', line: 'rh_take', parts: all })
  acts.push({ id: 'mirror', title: 'Зеркало', line: 'rh_mirror' })
  acts.push({ id: 'summary', title: 'Итог' })
  return { plan, acts }
}
