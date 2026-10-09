// Правило «первое увиденное (с выдержкой)»: движок сначала показывает в interim то, что услышал, а потом «исправляет» по языковой модели
// (сказал «try» — на экране «I'm try», через секунду «I'm trying»). Восстанавливаем гипотезу «как слышал движок ДО исправления» и решаем, что слово
// эталона произнесено верно, только если ошибочная («буквальная») форма этого слова не продержалась в interim дольше порога выдержки подряд
// и не стояла на экране в момент конца речи (событие speechend/soundend). Мимолётное «try» посреди «trying» (<200–500 мс) исправлением речи не считается.
// Вход: history — записи {t, text, final?} и служебные {t, kind} из speechController (мс от старта попытки). Чистая функция, без React.
import { tokenize } from './speechMatch.js'
import { sameFamily } from './wordFamily.js'

export const DWELL_DEFAULT = 500
export const DWELL_MIN = 200
export const DWELL_MAX = 1200
export const END_EVENTS = ['speechend', 'soundend']

export const clampDwell = v => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(DWELL_MAX, Math.max(DWELL_MIN, Math.round(n))) : DWELL_DEFAULT
}

// Тексты по порядку: interim из истории + итог. Нет истории — единственный lastInterim без времени (t: null)
function snapshotsOf({ history = [], final, lastInterim = '' }) {
  const texts = history.filter(h => typeof h?.text === 'string' && h.text).map(h => ({ t: typeof h.t === 'number' ? h.t : null, text: h.text, final: !!h.final }))
  if (!texts.some(x => !x.final) && lastInterim) texts.unshift({ t: null, text: lastInterim, final: false })
  if (final?.text && !texts.some(x => x.final)) texts.push({ t: texts.length ? texts[texts.length - 1].t : null, text: final.text, final: true })
  return texts.map(x => ({ ...x, tokens: tokenize(x.text) }))
}

// Самый долгий непрерывный показ формы (мс): серия снимков подряд, где она есть, до первого снимка без неё. null — время неизвестно
function longestDwell(snaps, has) {
  let best = 0
  for (let i = 0; i < snaps.length; i++) {
    if (!has[i] || (i > 0 && has[i - 1])) continue
    let j = i
    while (j + 1 < snaps.length && has[j + 1]) j++
    const t0 = snaps[i].t
    const t1 = j + 1 < snaps.length ? snaps[j + 1].t : snaps[j].t
    if (t0 == null || t1 == null) return null
    best = Math.max(best, t1 - t0)
  }
  return best
}

// Стояла ли форма на экране в момент любого из событий конца речи: активный снимок = последний с t ≤ момента события
function shownAtEnd(snaps, has, endTimes) {
  return endTimes.some(te => {
    let k = -1
    snaps.forEach((s, i) => { if (s.t != null && s.t <= te) k = i })
    return k >= 0 && has[k]
  })
}

/**
 * @param {{reference: string, history?: object[], final?: {text: string}, lastInterim?: string, dwellMs?: number, keys?: string[]}} p
 *   keys — слова эталона, по которым выносится вердикт (по умолчанию все); words/disputed описывают все слова эталона
 * @returns {{used: boolean, dwellMs: number, text: string, words: object[], disputed: object[], blocked: string[], missed: string[], ok: boolean}}
 *   used — был хоть один interim до итога (иначе судить по выдержке нечем: решает один итог);
 *   text — восстановленная гипотеза (самая ранняя форма каждого слова эталона; «…» — слова не было);
 *   words[{word, state: 'confirmed'|'literal'|'absent', form, firstAt}]; disputed[{word, form, dwellMs (null — время неизвестно), atEnd, inFinal, blocked}] — слова,
 *   у которых в interim показывалась буквальная форма
 */
export function firstSeenRule({ reference, history = [], final, lastInterim = '', dwellMs = DWELL_DEFAULT, keys = null }) {
  const dwell = clampDwell(dwellMs)
  const ref = [...new Set(tokenize(reference))]
  const snaps = snapshotsOf({ history, final, lastInterim })
  const endTimes = history.filter(h => END_EVENTS.includes(h?.kind) && typeof h.t === 'number').map(h => h.t)
  const lastIdx = snaps.length - 1
  const words = []
  const disputed = []
  for (const word of ref) {
    const literals = [...new Set(snaps.flatMap(s => s.tokens).filter(t => t !== word && !ref.includes(t) && sameFamily(t, word)))]
    const hasExact = snaps.map(s => s.tokens.includes(word))
    let blocked = false
    for (const form of literals) {
      const has = snaps.map(s => s.tokens.includes(form))
      const ms = longestDwell(snaps, has)
      const inFinal = lastIdx >= 0 && snaps[lastIdx].final && has[lastIdx]
      const atEnd = shownAtEnd(snaps, has, endTimes)
      const block = inFinal || atEnd || ms == null || ms > dwell
      blocked = blocked || block
      disputed.push({ word, form, dwellMs: ms, atEnd, inFinal, blocked: block })
    }
    // самая ранняя форма из семьи (точная предпочтительнее при равенстве)
    let first = null
    snaps.forEach((s, i) => {
      if (first) return
      const form = s.tokens.includes(word) ? word : literals.find(f => s.tokens.includes(f))
      if (form) first = { form, firstAt: s.t, idx: i }
    })
    const state = blocked ? 'literal' : hasExact.some(Boolean) ? 'confirmed' : 'absent'
    words.push({ word, state, form: first?.form ?? null, firstAt: first?.firstAt ?? null })
  }
  const judged = keys ? words.filter(w => keys.includes(w.word)) : words
  const missed = judged.filter(w => w.state !== 'confirmed').map(w => w.word)
  return {
    used: snaps.some(s => !s.final), dwellMs: dwell, text: words.map(w => w.form ?? '…').join(' '), words, disputed,
    blocked: words.filter(w => w.state === 'literal').map(w => w.word), missed, ok: missed.length === 0,
  }
}

/** Пояснение к вердикту одной строкой: «trying: «try» держалась 1100 мс (в конце речи)» */
export function firstSeenNote(r) {
  const parts = r.disputed.filter(d => d.blocked).map(d => `${d.word}: «${d.form}» ${d.inFinal ? 'в итоге' : d.dwellMs == null ? 'время неизвестно' : `держалась ${d.dwellMs} мс`}${d.atEnd ? ', на момент конца речи' : ''}`)
  if (parts.length) return parts.join('; ')
  const fleeting = r.disputed.map(d => `${d.word}←«${d.form}» ${d.dwellMs} мс`)
  const absent = r.words.filter(w => w.state === 'absent').map(w => w.word)
  return [fleeting.length ? `мимолётно (≤${r.dwellMs} мс): ${fleeting.join(', ')}` : '', absent.length ? `не слышали: ${absent.join(', ')}` : ''].filter(Boolean).join('; ')
}
