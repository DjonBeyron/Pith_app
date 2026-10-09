// «Мелькание» ошибочной формы в потоке interim и порог выдержки. Движок сначала показывает то, что услышал буквально («I'm try»), а потом
// ОРФОГРАФИЧЕСКИ переписывает слово по языковой модели («I'm trying») — ошибочная форма стоит на экране считанные сотни миллисекунд.
// Здесь: снимки истории interim, сколько мс форма стояла подряд, решение «ошибочная форма поймана при пороге D мс» (его используют правило
// «первое увиденное» firstSeenRule.js, диагностика пробы «Голос» и режим «Строго» модуля «Сказать фразу») и тексты «мелькала N мс». Чистые функции.
import { tokenize } from './speechMatch.js'

export const DWELL_DEFAULT = 500
export const DWELL_MIN = 0 // 0 = любое появление ошибочной формы в потоке interim
export const DWELL_MAX = 1200
export const DWELL_STEP = 50
export const DWELL_PRESETS = [0, 150, 300, 500] // быстрый выбор порога для модуля «Сказать фразу» (админ)
export const THRESHOLDS = [0, 100, 200, 300, 500] // пороги таблицы «поймали ошибок / ложных тревог»
export const END_EVENTS = ['speechend', 'soundend']

export const clampDwell = v => {
  const n = v == null || v === '' ? NaN : Number(v)
  return Number.isFinite(n) ? Math.min(DWELL_MAX, Math.max(DWELL_MIN, Math.round(n))) : DWELL_DEFAULT
}

/** Тексты по порядку: interim из истории + итог. Нет истории — единственный lastInterim без времени (t: null). Каждый снимок: {t, text, final, tokens} */
export function snapshotsOf({ history = [], final, lastInterim = '' }) {
  const texts = history.filter(h => typeof h?.text === 'string' && h.text).map(h => ({ t: typeof h.t === 'number' ? h.t : null, text: h.text, final: !!h.final }))
  if (!texts.some(x => !x.final) && lastInterim) texts.unshift({ t: null, text: lastInterim, final: false })
  if (final?.text && !texts.some(x => x.final)) texts.push({ t: texts.length ? texts[texts.length - 1].t : null, text: final.text, final: true })
  return texts.map(x => ({ ...x, tokens: tokenize(x.text) }))
}

/** Самый долгий непрерывный показ формы (мс): серия снимков подряд, где она есть, до первого снимка без неё. null — время неизвестно */
export function longestDwell(snaps, has) {
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

/** Что известно о форме в истории: {any, interim (стояла в interim), firstAt (мс первого появления), dwellMs (самый долгий показ подряд), atEnd, inFinal} */
export function formStats(snaps, form, endTimes = []) {
  const has = snaps.map(s => s.tokens.includes(form))
  const first = has.indexOf(true)
  const last = snaps.length - 1
  return {
    any: first >= 0, interim: has.some((h, i) => h && !snaps[i].final), firstAt: first >= 0 ? snaps[first].t : null,
    dwellMs: first >= 0 ? longestDwell(snaps, has) : 0, atEnd: shownAtEnd(snaps, has, endTimes),
    inFinal: last >= 0 && snaps[last].final && has[last],
  }
}

/**
 * Поймана ли форма при пороге dwell: в итоге, на конце речи, время неизвестно, либо мелькала ДОЛЬШЕ порога. Порог 0 — ловит любое появление.
 * f — {dwellMs, atEnd, inFinal}
 */
export const isBlocked = (f, dwell) => !!(f.inFinal || f.atEnd || f.dwellMs == null || dwell <= 0 || f.dwellMs > dwell)

/** Поймала ли ошибку хоть одна из форм при пороге dwell */
export const catchesAt = (forms, dwell) => (forms ?? []).some(f => isBlocked(f, dwell))

/** Сводка мелькания: {shown (форма стояла в interim), inFinal (осталась в итоге), maxMs (дольше всего подряд; null — время неизвестно), form} */
export function flashSummary(forms = []) {
  const seen = forms.filter(f => f.interim)
  const timed = seen.filter(f => typeof f.dwellMs === 'number')
  const top = timed.reduce((b, f) => (!b || f.dwellMs > b.dwellMs ? f : b), null)
  return {
    shown: seen.length > 0, inFinal: forms.some(f => f.inFinal), maxMs: top ? top.dwellMs : null,
    form: (top ?? seen[0] ?? forms[0])?.form ?? null, unknown: seen.length > 0 && !timed.length,
  }
}

/** Простыми словами: «мелькала «try» 280 мс» | «мелькала «try» (время неизвестно)» | «стоит в итоге «try»» | «не мелькала» */
export function flashText(forms) {
  const s = flashSummary(forms)
  if (s.shown) return s.unknown ? `мелькала «${s.form}» (время неизвестно)` : `мелькала «${s.form}» ${s.maxMs} мс`
  return s.inFinal ? `стоит в итоге «${s.form}»` : 'не мелькала'
}

// ---- компактная запись в журнал/серию: [слово, форма, мс, с какого мс, на конце речи 0/1, в итоге 0/1, в interim 0/1] ----
export const packForm = f => [f.word, f.form, f.dwellMs, f.firstAt, f.atEnd ? 1 : 0, f.inFinal ? 1 : 0, f.interim ? 1 : 0]
export const unpackForm = a => ({ word: a[0], form: a[1], dwellMs: a[2], firstAt: a[3], atEnd: !!a[4], inFinal: !!a[5], interim: !!a[6] })
export const unpackForms = list => (Array.isArray(list) ? list.filter(Array.isArray).map(unpackForm) : [])
