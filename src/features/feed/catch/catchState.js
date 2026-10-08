import { appendChar, removeLast, typedMatches, typedMax } from '../../../shared/lib/typeWordKeys.js'

// Состояние задания «Ловля слов» на одном слайде — чистые переходы без React (useSlideCatch.js
// только держит это состояние в useState и дёргает сигналы/аналитику). Проверяется catchState.test.js.
//   open     — панель набора открыта (свайп ленты заблокирован)
//   current  — index слова, которое сейчас печатают (null — между словами: «тапни следующее»)
//   typed    — напечатанное
//   helped   — index'ы слов, для которых нажали «Помочь памяти»
//   typedIdx — index'ы уже набранных слов (маска спала)
//   done     — задание закончено: все слова набраны или «Раскрыть фразу»
export function initialCatch(modId = null) {
  return { modId, open: false, current: null, typed: '', helped: new Set(), typedIdx: new Set(), done: false }
}

// Слово задания по index (words — catchWords(title, knowledge))
export const wordAt = (words, index) => words.find(w => w.index === index) ?? null

// Тап по замаскированному слову: открывает панель и делает слово текущим. Набранное/несуществующее — игнор
export function pickWord(s, words, index) {
  if (s.done || s.typedIdx.has(index) || !wordAt(words, index)) return s
  if (s.current === index) return s
  return { ...s, open: true, current: index, typed: '' }
}

export function press(s, words, ch) {
  const w = s.current == null ? null : wordAt(words, s.current)
  if (!w || s.done) return s
  const typed = appendChar(s.typed, ch, typedMax(w.text))
  return typed === s.typed ? s : { ...s, typed }
}

export function backspace(s) {
  return s.typed === '' ? s : { ...s, typed: removeLast(s.typed) }
}

// «Помочь памяти» — один раз на слово
export function help(s) {
  if (s.current == null || s.helped.has(s.current)) return s
  return { ...s, helped: new Set([...s.helped, s.current]) }
}

// «Проверить»: верно → слово набрано, текущее сбрасывается (панель остаётся открытой, пока есть что набирать);
// все слова набраны → done и панель закрыта. → { state, result: 'correct' | 'wrong' | null }
export function check(s, words) {
  const w = s.current == null ? null : wordAt(words, s.current)
  if (!w || s.done || !s.typed.trim()) return { state: s, result: null }
  if (!typedMatches(s.typed, w.text)) return { state: s, result: 'wrong' }
  const typedIdx = new Set([...s.typedIdx, s.current])
  const done = words.every(x => typedIdx.has(x.index))
  return { state: { ...s, typedIdx, current: null, typed: '', done, open: !done }, result: 'correct' }
}

// «Раскрыть фразу» — задание закончено, ненабранные слова не засчитываются
export function reveal(s) {
  return s.done ? s : { ...s, done: true, open: false, current: null, typed: '' }
}

// Слайд ушёл с экрана: панель закрываем, текущее слово сбрасываем; набранные остаются
export function closePanel(s) {
  if (!s.open && s.current == null) return s
  return { ...s, open: false, current: null, typed: '' }
}

// Сколько слов фразы ещё не набрано
export const remainingOf = (s, words) => words.filter(w => !s.typedIdx.has(w.index)).length
