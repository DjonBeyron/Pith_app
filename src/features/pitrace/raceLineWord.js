// «Момент слова в реплике»: когда (мс от начала звука реплики) звучит слово, начинающееся на stem. Нужен событиям, привязанным к слову, а не к длине файла: плашка этапа «Конвейер слов»
// появляется на слове «запускаю» стартовой фразы (raceOpening.js, комментарий владельца 2026-11-25). Тот же подход, что у шкалы экзамена на слове «шкала» (boss/bossScale.revealAtMs) —
// там своя копия под одно слово; их стоит объединить на этой функции (файлы boss вела параллельная работа, здесь они не тронуты).
//  • есть тайминги слов записи (line.words: [{ w, t, e }] — секунды в файле, line.duration — длина файла) — момент начала слова в файле, пересчитанный на реальную длину звука ms;
//  • нет — доля по месту слова в тексте (line.text); слова в тексте нет — запасная доля fallback.
// Заменили озвучку — срок берётся из новой записи: числа «под файл» нет. Чистая функция.
const norm = s => String(s ?? '').toLowerCase().replace(/ё/g, 'е')
const wordsOf = line => (Array.isArray(line?.words) ? line.words : [])

/** → мс от начала звука реплики (0…ms). line — { text, words, duration }, ms — длина звука, stem — начало слова (без учёта регистра и «ё»), fallback — доля длины, когда слова нет */
export function wordAtMs(line, ms, stem, fallback = 0.5) {
  const k = norm(stem), len = Math.max(0, Number(ms) || 0)
  if (!k) return Math.round(len * fallback)
  const w = wordsOf(line).find(x => norm(x?.w).startsWith(k))
  if (w && Number.isFinite(w.t) && line.duration > 0) return Math.round(len * Math.min(1, Math.max(0, w.t / line.duration)))
  const text = norm(line?.text), at = text.indexOf(k)
  return Math.round(len * (at >= 0 && text.length ? at / text.length : fallback))
}

/** Есть ли слово в реплике (в таймингах записи или в тексте) */
export const hasWord = (line, stem) => { const k = norm(stem); return !!k && (wordsOf(line).some(x => norm(x?.w).startsWith(k)) || norm(line?.text).includes(k)) }
