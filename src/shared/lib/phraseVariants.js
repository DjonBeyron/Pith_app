// Несколько верных ответов «Собери фразу» (поле answers рядом с основным words). Чистые функции, без React.
// words — главный ответ (на него ссылаются слоты сигналов и «авто-ответ» админа), answers — дополнительные верные порядки слов:
// [["Every","day","we","try"]]. Засчитывается любой из них; сравнение слов без учёта регистра, как и раньше.
import { firstMismatchSlot } from './signalMismatch.js'

const same = (a, b) => (a ?? '').toLowerCase() === (b ?? '').toLowerCase()

/** Один дополнительный ответ → массив слов. Строка тоже годится («Every day we try»), пустое отбрасывается */
function toWords(answer) {
  const list = Array.isArray(answer) ? answer : String(answer ?? '').split(/\s+/)
  return list.map(w => String(w ?? '').trim()).filter(Boolean)
}

/** Все верные порядки слов ноды: главный (words) первым, затем answers. Пустые ответы не берём */
export function phraseVariants(pa) {
  const main = toWords(pa?.words)
  const extra = (pa?.answers ?? []).map(toWords).filter(a => a.length)
  return main.length ? [main, ...extra] : extra
}

/**
 * Какие слова лежат в банке: слова главного ответа плюс слова, которых не хватает другим вариантам (по максимуму повторов
 * каждого слова среди вариантов, регистр не важен). Ловушки добавляет вызывающий код.
 */
export function chipWords(variants) {
  // Сколько раз слово нужно в самом «требовательном» варианте
  const need = new Map()
  for (const v of variants) {
    const local = new Map()
    for (const w of v) local.set(w.toLowerCase(), (local.get(w.toLowerCase()) ?? 0) + 1)
    for (const [k, n] of local) need.set(k, Math.max(need.get(k) ?? 0, n))
  }
  // Порядок: слова главного ответа в его порядке (как раньше), затем недостающие слова остальных вариантов
  const out = []
  for (const v of variants) {
    for (const w of v) {
      const k = w.toLowerCase()
      if ((need.get(k) ?? 0) > 0) { out.push(w); need.set(k, need.get(k) - 1) }
    }
  }
  return out
}

/**
 * Проверка собранной фразы. full — длина совпала хотя бы с одним вариантом (только на полном ответе смотрим сигналы);
 * correct — совпал целиком любой вариант; mismatchIdx — первое неверное место у САМОГО БЛИЗКОГО варианта (где верный
 * префикс длиннее всего), null — всё сошлось или ответ неполный.
 */
export function judgeAssembly(placedWords, variants) {
  const sameLen = variants.filter(v => v.length === placedWords.length)
  if (!sameLen.length) return { full: false, correct: false, mismatchIdx: null }
  let best = null
  for (const v of sameLen) {
    const idx = firstMismatchSlot(placedWords, v, same)
    if (idx == null) return { full: true, correct: true, mismatchIdx: null }
    if (best == null || idx > best) best = idx
  }
  return { full: true, correct: false, mismatchIdx: best }
}
