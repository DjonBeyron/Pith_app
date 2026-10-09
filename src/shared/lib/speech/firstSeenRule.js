// Правило «первое увиденное (с выдержкой)»: движок сначала показывает в interim то, что услышал, а потом «исправляет» по языковой модели
// (сказал «try» — на экране «I'm try», через секунду «I'm trying»). Восстанавливаем гипотезу «как слышал движок ДО исправления» и решаем, что слово
// эталона произнесено верно, только если ошибочная («буквальная») форма этого слова не продержалась в interim дольше порога выдержки подряд
// и не стояла на экране в момент конца речи (событие speechend/soundend). Мимолётное «try» посреди «trying» (короче порога) исправлением речи не считается; порог 0 — ловится любое появление.
// Вход: history — записи {t, text, final?} и служебные {t, kind} из speechController (мс от старта попытки). Чистая функция, без React.
import { tokenize } from './speechMatch.js'
import { sameFamily } from './wordFamily.js'
import { DWELL_DEFAULT, DWELL_MIN, DWELL_MAX, END_EVENTS, clampDwell, snapshotsOf, formStats, isBlocked } from './flashDwell.js'

export { DWELL_DEFAULT, DWELL_MIN, DWELL_MAX, END_EVENTS, clampDwell } // константы порога живут в flashDwell.js (порог 0–1200 мс, 0 = любое появление формы)

/**
 * @param {{reference: string, history?: object[], final?: {text: string}, lastInterim?: string, dwellMs?: number, keys?: string[]}} p
 *   keys — слова эталона, по которым выносится вердикт (по умолчанию все); words/disputed описывают все слова эталона
 * @returns {{used: boolean, dwellMs: number, text: string, words: object[], disputed: object[], blocked: string[], missed: string[], ok: boolean}}
 *   used — был хоть один interim до итога (иначе судить по выдержке нечем: решает один итог);
 *   text — восстановленная гипотеза (самая ранняя форма каждого слова эталона; «…» — слова не было);
 *   words[{word, state: 'confirmed'|'literal'|'absent', form, firstAt}]; disputed[{word, form, dwellMs (null — время неизвестно), atEnd, inFinal, blocked, firstAt, interim}] — слова,
 *   у которых в interim показывалась буквальная форма
 */
export function firstSeenRule({ reference, history = [], final, lastInterim = '', dwellMs = DWELL_DEFAULT, keys = null }) {
  const dwell = clampDwell(dwellMs)
  const ref = [...new Set(tokenize(reference))]
  const snaps = snapshotsOf({ history, final, lastInterim })
  const endTimes = history.filter(h => END_EVENTS.includes(h?.kind) && typeof h.t === 'number').map(h => h.t)
  const words = []
  const disputed = []
  for (const word of ref) {
    const literals = [...new Set(snaps.flatMap(s => s.tokens).filter(t => t !== word && !ref.includes(t) && sameFamily(t, word)))]
    const hasExact = snaps.map(s => s.tokens.includes(word))
    let blocked = false
    for (const form of literals) {
      const st = formStats(snaps, form, endTimes)
      const block = isBlocked(st, dwell)
      blocked = blocked || block
      disputed.push({ word, form, dwellMs: st.dwellMs, atEnd: st.atEnd, inFinal: st.inFinal, blocked: block, firstAt: st.firstAt, interim: st.interim })
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
