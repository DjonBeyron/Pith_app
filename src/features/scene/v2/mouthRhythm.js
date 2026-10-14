// Ритм рта по таймингам слов — чистая логика без DOM и таймеров (тесты в
// mouthRhythm.test.js). Вход: wordTimings реплики [{ word, start, end }] в
// СЕКУНДАХ медиа-времени (audio.currentTime — оно же, playbackRate на него не
// влияет, поэтому пересчёт при смене скорости не нужен). Выход: визема в
// момент t: 'open' | 'half' | 'closed'.
//
//  · внутри слова рот открыт: формы open/half чередуются по «слогам» (гласные
//    слова; одно слово — минимум один слог), чтобы длинное слово не висело
//    одной картинкой;
//  · в паузах между словами, до первого и после последнего — закрыт;
//  · нет wordTimings (старые сцены, ошибка генерации) — syntheticTimings():
//    слова текста раскладываются по известной длительности файла (а если и
//    её нет — по оценке fallbackMs из linePlayback.js) с небольшими паузами.

export const SHAPES = ['closed', 'half', 'open']
const VOWELS = /[аеёиоуыэюяaeiouyàâäéèêëîïôöùûüœ]/gi
// Доля слота слова под паузу после него в синтетических таймингах
const SYNTH_GAP = 0.18

export function syllableCount(word) {
  const m = String(word ?? '').match(VOWELS)
  return Math.max(1, m ? m.length : 1)
}

// Тайминги годятся: непустой массив, числа, end > start, начала не убывают
export function validTimings(timings) {
  if (!Array.isArray(timings) || !timings.length) return false
  let prev = -Infinity
  for (const w of timings) {
    if (!w || typeof w.start !== 'number' || typeof w.end !== 'number') return false
    if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start || w.start < prev) return false
    prev = w.start
  }
  return true
}

// Индекс слова, звучащего в момент t, либо -1 (пауза). from — подсказка, с
// какого индекса искать (слова идут по порядку; при seek назад ищем с нуля)
export function wordIndexAt(timings, t, from = 0) {
  let i = from > 0 && timings[from] && timings[from].start <= t ? from : 0
  for (; i < timings.length; i++) {
    const w = timings[i]
    if (t < w.start) return -1
    if (t < w.end) return i
  }
  return -1
}

// Форма рта внутри слова: слоги делят слово на равные отрезки, формы чередуются
export function shapeInWord(w, t) {
  const n = syllableCount(w.word)
  if (n === 1) return 'open'
  const seg = (w.end - w.start) / n
  const k = Math.min(n - 1, Math.floor((t - w.start) / seg))
  return k % 2 === 0 ? 'open' : 'half'
}

export function visemeAt(timings, t, from = 0) {
  if (!timings?.length || !Number.isFinite(t)) return 'closed'
  const i = wordIndexAt(timings, t, from)
  return i < 0 ? 'closed' : shapeInWord(timings[i], t)
}

// Запасные тайминги по тексту: слова получают доли длительности по длине
// (+1 — чтобы короткие не схлопывались), в конце каждого слота — пауза
export function syntheticTimings(text, durationSec) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const dur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0
  if (!words.length || !dur) return []
  const weights = words.map(w => w.replace(/[^\p{L}\p{N}]/gu, '').length + 1)
  const total = weights.reduce((s, w) => s + w, 0)
  const out = []
  let acc = 0
  words.forEach((word, i) => {
    const slot = (dur * weights[i]) / total
    out.push({ word, start: acc, end: acc + slot * (1 - SYNTH_GAP) })
    acc += slot
  })
  return out
}

// Длительность реплики по таймингам (конец последнего слова), секунды, или null
export function timingsEnd(timings) {
  return validTimings(timings) ? timings[timings.length - 1].end : null
}
