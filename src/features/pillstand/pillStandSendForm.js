// Состояние окна «📤 Отправить» стенда пилюль (CONCEPT_PILLSTAND.md, «Отправка по теме»): темы (несколько галочками; «Всё» поглощает остальные), отрезок (вся сессия / текущая цель / A–B из плеера —
// только если отмечен / последние N с), комментарий, звук (по умолчанию: вкл. для «Распознавания» и «Всего», выкл. для остальных — пока человек сам не тронул галочку). Метки кадров: момент «сейчас»
// окна (кадр плеера или миг живого экрана) → { t, i }. Чистые функции: окно (PillStandSend.jsx) только показывает форму и зовёт их.
import { TOPICS, normTopics } from './pillStandPacks.js'
import { LAST_SECONDS } from './pillStandSpan.js'
import { frameAt } from './pillStandPlayer.js'

export const SPAN_TITLE = { session: 'вся сессия', target: 'текущая цель', ab: 'A–B из плеера', last: 'последние' }
export const MARK_NEAR_MS = 60 // живой экран: метка привязывается к кадру записи, если он не дальше

export const emptyForm = () => ({ topics: [], span: 'target', sec: LAST_SECONDS[1], comment: '', sound: false, soundTouched: false })

/** Звук по умолчанию для выбора тем */
export const soundDefault = topics => topics.includes('ear') || topics.includes('all')

/** Галочка темы t */
export function toggleTopic(form, t) {
  if (!TOPICS.includes(t)) return form
  const on = form.topics.includes(t)
  const topics = on ? form.topics.filter(x => x !== t) : normTopics(t === 'all' ? ['all'] : [...form.topics.filter(x => x !== 'all'), t])
  return { ...form, topics, sound: form.soundTouched ? form.sound : soundDefault(topics) }
}

export const setSpan = (form, span, sec = form.sec) => ({ ...form, span, sec: LAST_SECONDS.includes(sec) ? sec : form.sec })
export const setComment = (form, comment) => ({ ...form, comment: String(comment ?? '') })
export const setSound = (form, on) => ({ ...form, sound: !!on, soundTouched: true })

/** Отрезок, который реально уйдёт: «A–B» без отмеченного A–B — текущая цель */
export const spanKind = (form, ab) => (form.span === 'ab' && !(ab && ab[1] > ab[0]) ? 'target' : form.span)

/** Можно отправлять: выбрана хоть одна тема */
export const canSend = form => form.topics.length > 0

/** Метка в момент at: в плеере frame — номер кадра; на живом экране — ближайший кадр записи (если рядом) */
export function markAt(at, frames = [], frame = null) {
  if (frame != null && frames[frame]) return { t: frames[frame].t, i: frames[frame].i ?? frame }
  const k = frameAt(frames, at)
  const near = [k, k + 1].filter(i => i >= 0 && frames[i]).sort((a, b) => Math.abs(frames[a].t - at) - Math.abs(frames[b].t - at))[0]
  return near != null && Math.abs(frames[near].t - at) <= MARK_NEAR_MS ? { t: at, i: frames[near].i ?? near } : { t: Math.round(at * 10) / 10, i: null }
}
