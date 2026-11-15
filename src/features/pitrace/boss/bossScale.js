import { SPEED } from '../../player/modules/rotate-phone/wordLaneTimeline.js'

// Шкала финала «Шкала памяти» (чистые функции без DOM): время реакции — сколько секунд пилюля ехала от своего появления на экране (нижний край у верхнего края поля) до ответа. Чем ниже уехала
// пилюля (и линия, которую она толкает), тем дольше вспоминалось слово и тем слабее оно держится. Скорость пилюли — SPEED · speed (% высоты поля в секунду).
export const ZONES = [{ id: 'fast', to: 2 }, { id: 'mid', to: 4 }, { id: 'slow', to: Infinity }] // до 2 с — слово держится крепко, до 4 с — средне, дольше — слабо

/** Секунды по положению нижнего края пилюли (% высоты поля) */
export const timeAt = (bottomPct, speed) => Math.max(0, bottomPct) / (SPEED * (speed > 0 ? speed : 1))
/** Положение (% высоты поля) по секундам */
export const yAt = (t, speed) => t * SPEED * (speed > 0 ? speed : 1)
/** Зона по времени */
export const zoneOf = t => ZONES.find(z => t < z.to).id
/** Подпись счётчика: «2,4 с» */
export const fmt = t => `${(Math.round(t * 10) / 10).toFixed(1).replace('.', ',')} с`
/** Деления шкалы: целые секунды от 1 до тех, что умещаются в maxPct % высоты → [{ t, y }] */
export function ticks(speed, maxPct = 100) {
  const out = []
  for (let t = 1; yAt(t, speed) <= maxPct; t++) out.push({ t, y: yAt(t, speed) })
  return out
}

export const HOLD_MS = 1800 // сколько линия остаётся на высоте ответа после принятия / «не успел»

/**
 * Какую пилюлю толкает линия (чистая логика кадра, без DOM). pills — [{ el, top, bottom, locked, failed }] (px от верха поля; el — любой маркер, нужен только для «та же пилюля»), H — высота поля,
 * tr — прежнее состояние { el, y, done, at } или null, now — часы. → новое состояние. Новая пилюля берётся, когда прежней нет или она закончена (принята / «не успел» / ушла вниз): ближайшая к верху из
 * видимых, не принятых и не ушедших. Тот же элемент берётся заново (пул пилюль переиспользует элементы: следующее слово едет на том же узле — раньше линия его не видела).
 */
export function trackStep(tr, pills, H, now) {
  let cur = tr
  if (cur && !cur.done) {
    const p = pills.find(x => x.el === cur.el)
    if (!p || p.locked || p.failed || p.top > H * 0.9) cur = { ...cur, done: true, at: now }
    else cur = { ...cur, y: p.bottom }
  }
  if (!cur || cur.done) {
    const next = pills.filter(p => !p.locked && !p.failed && p.bottom > 0 && p.top < H * 0.9).sort((a, b) => a.top - b.top)[0]
    if (next) return { el: next.el, y: next.bottom, done: false, at: 0 }
  }
  return cur
}

/** Показана ли линия: идёт пилюля или после ответа не прошло HOLD_MS */
export const lineOn = (tr, now) => !!tr && (!tr.done || now - tr.at < HOLD_MS)

/** Реплики Мии, на которых загорается зона (мигает полупрозрачной заливкой), и реплики, с которых шкалу видно на церемонии («видите шкалу справа?» и дальше) */
export const FLASH_LINES = { boss_mia_green: 'fast', boss_mia_yellow: 'mid', boss_mia_red: 'slow' }
export const REVEAL_LINES = ['boss_mia_look', 'boss_mia_think', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five']
/** talk — реплика Мии { id, key, ms } (miaSpeech.onSpeak) → { zone, key, ms } или null */
export const flashOf = talk => (talk && FLASH_LINES[talk.id] ? { zone: FLASH_LINES[talk.id], key: talk.key, ms: talk.ms } : null)
