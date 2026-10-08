import { publishLevel, unpublishLevel, hasPlayingSources } from '../audioLevel.js'

// Превью чувствительности эквалайзера: короткий синтетический импульс свечения
// (профиль ui-all), чтобы админ, двигая ползунок, видел результат, даже когда
// ничего не играет. Уровень PREVIEW_LEVEL умножается на чувствительность в
// audioLevel.js — как у любого другого источника. Повторный вызов продлевает
// импульс, не перезапуская вход (без мигания)
export const PREVIEW_ID = 'eq-preview'
export const PREVIEW_MS = 1200
export const PREVIEW_LEVEL = 0.3
const ATTACK_S = 0.08
const RELEASE_S = 0.3

let active = false
let t0 = 0
let endAt = 0
let timer = 0

// Огибающая в момент now (мс, шкала performance.now): вход, лёгкое «дыхание», спад
export function previewEnvelope(now, start, end) {
  if (now >= end || now < start) return 0
  const attack = Math.min(1, (now - start) / 1000 / ATTACK_S)
  const release = Math.min(1, (end - now) / 1000 / RELEASE_S)
  const breathe = 0.9 + 0.1 * Math.sin(now / 1000 * 14)
  return PREVIEW_LEVEL * attack * release * breathe
}

function stop() {
  clearTimeout(timer)
  timer = 0
  active = false
  unpublishLevel(PREVIEW_ID)
}

export function playEqPreview(now = () => performance.now()) {
  if (!active && hasPlayingSources()) return      // идёт настоящий звук — свечение и так видно
  const n = now()
  endAt = n + PREVIEW_MS
  if (!active) {
    active = true
    t0 = n
    publishLevel(PREVIEW_ID, { playing: true, profile: 'ui-all', getLevel: m => previewEnvelope(m, t0, endAt) })
  }
  clearTimeout(timer)
  timer = setTimeout(stop, PREVIEW_MS + 40)
}

export function stopEqPreview() { if (active) stop() }
