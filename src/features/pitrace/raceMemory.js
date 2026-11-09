// Запись игры «Встряхни память» в память слов (CONCEPT_RACE.md, «Этап 2» → «Память: запись из игры»): в финале — ОДНО событие повторения на слово, source 'game'.
// Чистая часть — outcomesOf(summary): по итогу гонки (raceSim.reportRace / scoreRace: weak — слова проходов с точностью raceAccuracy.js, words — слова плана с hit / miss, где miss включает «Вершину»)
// → карта «ключ слова → исход»:
//  • всегда верно и чисто (ни промаха, ни ответа «в последний момент», ни «не то» на пилюле) → 'good';
//  • верно после промаха или нечисто (поздно, «не то», понадобился дополнительный круг) → 'hard';
//  • только промахи, зачёта нет ни разу → 'again';
//  • слова, которых в игре не было (нет ни одного результата), — не трогаем.
// Результаты фраз этапа 2 (поля слова phraseHits / phraseMisses / phraseUnclean — raceStatePhrases.phraseHits) складываются с пилюлями: попадание фразы — зачёт слову, промах фразы — промах;
// круг «Скажи» — одна единица на фразу по двум проходам (racePhrasePasses.passOutcome): проход 1 не сказан — промах (again), проход 2 не «чисто» — зачёт, но нечисто (phraseUnclean → hard), оба чисто — зачёт (good).
// pushRaceMemory — отправка: по одному слову ПОСЛЕДОВАТЕЛЬНО (не душим RPC), reviewWord из memoryApi.js (гость — сам уходит в guestMemory.js), журнал «[memory] …»; сбой сети финал не ломает.
import { pLog } from '../../shared/lib/debug.js'
import { reviewWord } from '../../shared/api/memoryApi.js'
import { wordKey } from '../../shared/lib/wordAudio/wordKey.js'
import { failedIn } from './raceExtraRound.js'

export const GAME_SOURCE = 'game'

/** Писать ли игру в память: гонка не на стенде с фикстурой (source 'sim' — фикстуры и JSON админки) и план не запретил (memoryWrite: false) */
export const memoryOn = plan => plan?.game === 'race' && plan.memoryWrite !== false && plan.source !== 'sim' && !plan.debugStart // старт с этапа (отладка) память не пишет

const num = x => (Number.isFinite(x) && x > 0 ? x : 0)

/** Счёт одного результата пилюли в { hits, misses, unclean } (r — результат raceState: { hit, miss, late, trap, wrong }) */
function addPill(acc, r) {
  if (r?.trap) { // ловушка: промолчал — чисто, поверил чужому — промах
    if (failedIn(r)) acc.misses++
    else acc.hits++
    return
  }
  if (!r || !r.hit) { acc.misses++; return }
  acc.hits++
  if (r.miss) acc.misses++ // верно, но после промаха
  if (r.late || num(r.wrong) > 0) acc.unclean = true
}

/** Проход A / B из точности слова (raceAccuracy.passScore): пилюли круга 1 и дополнительного круга; круг понадобился — уже нечисто */
function addPass(acc, pass) {
  if (!pass) return
  for (const r of pass.first ?? []) addPill(acc, r)
  if (pass.extra) {
    acc.unclean = true
    for (const r of pass.extra.results ?? []) addPill(acc, r)
  }
}

const blank = text => ({ text, hits: 0, misses: 0, unclean: false, acc: null, passes: 0 })

/** Исход по счёту слова; null — слова в игре не было */
export function outcomeOf({ hits, misses, unclean }) {
  if (!hits && !misses) return null
  if (!hits) return 'again'
  if (misses || unclean) return 'hard'
  return 'good'
}

/**
 * Итог гонки → { [ключ слова]: { word, outcome, acc, passes } } (только сыгранные слова; ключ — wordKey, как в word_memory).
 * acc — точность слова 0…100 (или null), passes — сколько проходов / этапов дали слову результат
 */
export function outcomesOf(summary) {
  const by = new Map()
  const at = text => {
    const k = wordKey(text)
    if (!k) return null
    if (!by.has(k)) by.set(k, blank(k))
    return by.get(k)
  }
  for (const w of summary?.weak ?? []) {
    const e = at(w.text)
    if (!e) continue
    const before = e.hits + e.misses
    addPass(e, w.acc?.a)
    addPass(e, w.acc?.b)
    e.passes += (w.acc?.a ? 1 : 0) + (w.acc?.b ? 1 : 0)
    if (Number.isFinite(w.acc?.pct) && e.hits + e.misses > before) e.acc = w.acc.pct
  }
  const phrased = new Set() // фразы этапа 2 — на любом из списков, но одному слову один раз
  for (const w of [...(summary?.weak ?? []), ...(summary?.words ?? [])]) {
    const e = at(w.text)
    const ph = num(w?.phraseHits), pm = num(w?.phraseMisses)
    if (!e || phrased.has(e.text) || !(ph || pm)) continue
    phrased.add(e.text)
    e.hits += ph; e.misses += pm; e.passes++
    if (num(w?.phraseUnclean) > 0) e.unclean = true // фраза «Скажи» с паузами / нечисто
  }
  for (const w of summary?.words ?? []) { // слова плана: «Вершина» — промах слова (words.miss), которого нет в пилюлях
    const e = at(w.text)
    if (!e) continue
    if (num(w.miss) > 0 && !e.misses) e.misses++ // промах «Вершины» (или прохода, не попавшего в weak)
    if (num(w.hit) > 0 && !e.hits) e.hits++
  }
  const out = {}
  for (const [k, e] of by) {
    const outcome = outcomeOf(e)
    if (outcome) out[k] = { word: k, outcome, acc: e.acc, passes: e.passes }
  }
  return out
}

/** Строка журнала одного слова: «[memory] слово → hard: step 2→2 (не в срок)» */
export function memoryLine(word, outcome, res) {
  if (!res) return `[memory] ${word} → ${outcome}: сбой записи`
  if (!res.ok) return `[memory] ${word} → ${outcome}: не записано (${res.reason ?? 'ошибка'})`
  return `[memory] ${word} → ${outcome}: step ${res.prev_step}→${res.step} (${res.applied ? 'applied' : 'не в срок'})`
}

/**
 * Записать исходы в память: по одному reviewWord на слово, последовательно. → { sent, ok, applied, failed, skipped }
 * outcomes — результат outcomesOf; review — reviewWord (подмена в тестах); lessonId — урок, из которого игра (или null)
 */
export async function pushRaceMemory({ outcomes, review = reviewWord, lessonId = null, log = pLog } = {}) {
  const list = Object.values(outcomes ?? {})
  const sum = { sent: 0, ok: 0, applied: 0, failed: 0, skipped: 0 }
  for (const o of list) {
    let res = null
    try {
      res = await review({ word: o.word, outcome: o.outcome, lessonId, source: GAME_SOURCE, events: { acc: o.acc, passes: o.passes } })
    } catch (e) {
      log(`[memory] ${o.word} → ${o.outcome}: сбой сети (${e?.message ?? e})`)
      sum.failed++
      continue
    }
    sum.sent++
    if (res?.ok) { sum.ok++; if (res.applied) sum.applied++ } else if (res?.reason === 'not_found') sum.skipped++
    else sum.failed++
    log(memoryLine(o.word, o.outcome, res))
  }
  log(`[memory] игра: слов ${list.length}, записано ${sum.ok} (шаг сдвинут у ${sum.applied}), нет в памяти ${sum.skipped}, сбоев ${sum.failed}`)
  return sum
}
