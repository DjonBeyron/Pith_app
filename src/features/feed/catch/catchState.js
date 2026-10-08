import { appendChar, removeLast, typedMatches, typedMax } from '../../../shared/lib/typeWordKeys.js'

// Состояние задания «Ловля слов» на одном слайде (спек v2) — чистые переходы без React
// (useSlideCatch.js держит это в useState и дёргает сигналы/аналитику). Проверяется catchState.test.js.
//   open     — шторка набора открыта (свайп ленты заблокирован)
//   phase    — 'type' (печатаем слова по порядку) | 'result' (финал: сравнение набранного с фразой)
//   cur      — index активного слова (подчёркнуто в полоске), null — шторку ещё не открывали
//   typedBy  — Map index → напечатанное (для каждого слова своё, сохраняется при переходах)
//   helped   — index'ы слов, для которых нажали «Подсказать»
//   revealed — финал наступил через «Раскрыть» (сигналы «услышано» не шлём)
//   results  — [{ index, ok, typed }] после check/reveal, до этого null
//   done     — «Готово» нажато: шторка закрыта, слайд становится обычным открытым
export function initialCatch(modId = null) {
  return { modId, open: false, phase: 'type', cur: null, typedBy: new Map(), helped: new Set(), revealed: false, results: null, done: false }
}

// Слово задания по index (words — catchWords(title, knowledge))
export const wordAt = (words, index) => words.find(w => w.index === index) ?? null

// Напечатанное для слова
export const typedOf = (s, index) => s.typedBy.get(index) ?? ''

// Активное слово — последнее в фразе
export const isLast = (s, words) => s.cur != null && words.length > 0 && words[words.length - 1].index === s.cur

// Тап по чипу/шарикам: шторка открывается, активным становится первое слово (или остаётся прежнее, если уже выбирали)
export function openSheet(s, words) {
  if (s.done || s.open) return s
  const cur = s.cur ?? words[0]?.index ?? null
  return { ...s, open: true, cur }
}

// Тап по слову в полоске — оно становится активным (можно вернуться к пропущенному). Набранное остаётся
export function setCurrent(s, words, index) {
  if (s.done || s.phase !== 'type' || s.cur === index || !wordAt(words, index)) return s
  return { ...s, cur: index }
}

function withTyped(s, index, typed) {
  const typedBy = new Map(s.typedBy)
  if (typed === '') typedBy.delete(index)
  else typedBy.set(index, typed)
  return { ...s, typedBy }
}

export function press(s, words, ch) {
  const w = s.cur == null ? null : wordAt(words, s.cur)
  if (!w || s.done || s.phase !== 'type') return s
  const was = typedOf(s, s.cur)
  const typed = appendChar(was, ch, typedMax(w.text))
  return typed === was ? s : withTyped(s, s.cur, typed)
}

export function backspace(s) {
  if (s.cur == null || s.phase !== 'type') return s
  const was = typedOf(s, s.cur)
  return was === '' ? s : withTyped(s, s.cur, removeLast(was))
}

// «Следующее слово»: активным становится следующее по порядку (набранное для прошлого сохраняется, даже пустое);
// на последнем слове — это «Проверить»: финал без лишнего шага
export function next(s, words) {
  if (s.done || s.phase !== 'type' || s.cur == null) return s
  const i = words.findIndex(w => w.index === s.cur)
  if (i === -1) return s
  if (i === words.length - 1) return check(s, words).state
  return { ...s, cur: words[i + 1].index }
}

// «Подсказать» — один раз на активное слово
export function help(s) {
  if (s.done || s.phase !== 'type' || s.cur == null || s.helped.has(s.cur)) return s
  return { ...s, helped: new Set([...s.helped, s.cur]) }
}

// Сравнение набранного с фразой: по каждому слову — верно ли (регистр/апостроф не важны, typedMatches)
export const compare = (s, words) => words.map(w => ({ index: w.index, ok: typedMatches(typedOf(s, w.index), w.text), typed: typedOf(s, w.index) }))

// «Проверить» → финал: { state (phase result), results }. Сигналы по results считает useSlideCatch
export function check(s, words) {
  if (s.done || s.phase !== 'type') return { state: s, results: s.results ?? [] }
  const results = compare(s, words)
  return { state: { ...s, phase: 'result', results }, results }
}

// «Раскрыть» → тот же финальный экран, но revealed: сигналы «услышано» не шлём — задание не завершено честно
export function reveal(s, words) {
  if (s.done || s.phase !== 'type') return s
  return { ...s, phase: 'result', revealed: true, results: compare(s, words) }
}

// «Готово» на финале: шторка закрывается, задание завершено
export function finish(s) {
  if (s.done || s.phase !== 'result') return s
  return { ...s, open: false, done: true }
}

// Слайд ушёл с экрана: шторку закрываем; набранное, активное слово и фаза остаются
export function closeSheet(s) {
  return s.open ? { ...s, open: false } : s
}

// Сколько слов расслышано (верно набрано) по results
export const okCount = results => (results ?? []).filter(r => r.ok).length
