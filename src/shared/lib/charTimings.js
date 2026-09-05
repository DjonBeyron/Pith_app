// Тайминги печати текста под звук: на каждый символ ОРИГИНАЛЬНОГО текста —
// момент (в секундах от начала аудио), когда он должен появиться. Плеер потом
// просто ищет последний символ, чьё время уже наступило (AudioModule.jsx).
//
// Почему не «слова через пробел»: раньше тайминги считались по реконструкции
// text.trim().split(/\s+/) — по одному символу на букву плюс один на
// разделитель. Печать же режет НАСТОЯЩИЙ текст, поэтому любой двойной пробел,
// пустая строка между абзацами или отступ в начале сдвигали печать
// относительно звука, и сдвиг копился к концу сообщения. Здесь позиции слов
// берутся прямо из текста (индексы совпадений), так что разделители любой
// длины ничего не ломают.
//
// И не «i-е слово текста = i-й тайминг»: ElevenLabs нормализует произносимое
// (числа, сокращения), Whisper расшифровывает на слух — количество слов может
// разойтись, и всё после расхождения ехало. Сопоставляем по самому слову, с
// окном на пропуск, а неопознанные слова получают время интерполяцией.

// Опережение печати: буква появляется чуть раньше, чем слышно слово — иначе
// на глаз кажется, что текст отстаёт от звука
const ADVANCE = 0.08
// Длительность последнего слова и шаг экстраполяции, когда таймингов не хватило
const TAIL = 0.4
// Насколько далеко вперёд ищем слово, если тайминги разошлись с текстом
const WINDOW = 4

const norm = s => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

// Старт каждого слова текста по таймингам; null — слово не опознано
function matchStarts(words, timings) {
  const out = new Array(words.length).fill(null)
  let ti = 0
  for (let wi = 0; wi < words.length; wi++) {
    const target = norm(words[wi].value)
    let hit = -1
    for (let k = ti; k < Math.min(timings.length, ti + WINDOW); k++) {
      if (norm(timings[k].w) === target) { hit = k; break }
    }
    if (hit === -1) { ti += 1; continue }   // не нашли — оставляем null, идём дальше
    out[wi] = timings[hit].t
    ti = hit + 1
  }
  return out
}

// Пропуски (null) заполняем: между известными — линейно, по краям — шагом TAIL
function fillGaps(starts, fallbackStart, fallbackEnd) {
  const n     = starts.length
  const known = starts.map((t, i) => (t == null ? -1 : i)).filter(i => i >= 0)
  if (!known.length) {
    const step = (fallbackEnd - fallbackStart) / Math.max(1, n)
    return starts.map((_, i) => fallbackStart + i * step)
  }

  const out   = starts.slice()
  const first = known[0]
  const last  = known[known.length - 1]
  for (let i = first - 1; i >= 0; i--)  out[i] = Math.max(0, out[i + 1] - TAIL)
  for (let i = last + 1; i < n; i++)    out[i] = out[i - 1] + TAIL
  for (let k = 0; k + 1 < known.length; k++) {
    const a = known[k], b = known[k + 1]
    if (b - a <= 1) continue
    const dt = (out[b] - out[a]) / (b - a)
    for (let i = a + 1; i < b; i++) out[i] = out[a] + (i - a) * dt
  }
  return out
}

/**
 * @param {string} text        текст сообщения как есть (с переносами и отступами)
 * @param {Array<{w:string,t:number}>} wordTimings  тайминги слов (ElevenLabs/Whisper)
 * @returns {number[]} время появления каждого символа text; [] — если считать не из чего
 */
export function buildCharTimings(text, wordTimings, { advance = ADVANCE } = {}) {
  if (!text || !wordTimings?.length) return []
  const words = [...text.matchAll(/\S+/g)].map(m => ({ value: m[0], index: m.index }))
  if (!words.length) return []

  const lastT  = wordTimings[wordTimings.length - 1]?.t ?? 0
  const starts = fillGaps(matchStarts(words, wordTimings), wordTimings[0]?.t ?? 0, lastT + TAIL)

  const out = new Array(text.length).fill(0)
  for (let wi = 0; wi < words.length; wi++) {
    const { value, index } = words[wi]
    const t    = Math.max(0, starts[wi] - advance)
    const next = wi + 1 < words.length ? Math.max(0, starts[wi + 1] - advance) : t + TAIL
    const dur  = Math.max(0.05, next - t)
    // Буквы слова растекаются по его длительности, пробелы/переносы после
    // него ждут ровно до начала следующего — печать не «догоняет» рывком
    for (let ci = 0; ci < value.length; ci++) out[index + ci] = t + (ci / value.length) * dur
    const gapEnd = wi + 1 < words.length ? words[wi + 1].index : text.length
    for (let gi = index + value.length; gi < gapEnd; gi++) out[gi] = t + dur
  }
  for (let i = 0; i < words[0].index; i++) out[i] = 0   // отступ в начале — сразу
  return out
}
