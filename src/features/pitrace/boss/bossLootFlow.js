// Ход начисления трофеев Мии (RaceBossLoot.jsx): когда пилюля «+N XP» появляется над её головой и когда число на её счётчике меняется. Без React; элементы приходят снаружи (s.els), поэтому
// проверяется тестом с подставными узлами (bossLootFlow.test.js). Состояние s: wait — трофеи, которые ждут начала колкости Мии; air — пилюля в полёте { n, a }; key — номер колкости, по которой
// пилюля уже выпущена; число на счётчике = lost − wait − air.n (трофеи приходят на счётчик, когда пилюля долетела).
import { isLootLine, lootStart, lootFrames, LOOT_TOTAL_MS, LOOT_WAIT_MS } from './bossLoot.js'
import { XP_PULSE_MS, xpPulseFrames } from '../../player/modules/rotate-phone/WordLaneXpFlight.js'

const PULSE = xpPulseFrames() // «вдох» счётчика — те же кадры, что у счётчика игрока (WordLaneXp)
export const lootState = () => ({ seen: null, dug: 0, lost: 0, wait: 0, air: null, key: null, timer: 0, still: false, els: {} })
/** Номер колкости Мии про трофеи, которую она говорит сейчас (talk — useExamSpeech.miaTalk), или null */
export const lootKey = talk => (isLootLine(talk?.id) ? talk.key : null)

const paint = s => { if (s.els.num) s.els.num.textContent = String(Math.max(0, s.lost - s.wait - (s.air?.n ?? 0))) }
const drop = s => { try { s.air?.a?.cancel() } catch { /* уже кончилась */ } }
function land(s) { // пилюля долетела (или её не было): число растёт, счётчик «распухает», как счётчик игрока
  s.air = null; paint(s)
  s.els.chip?.animate?.(PULSE, { duration: XP_PULSE_MS, easing: 'linear' })
}
/** Голова Мии на экране (видимая из её голов) → прямоугольник или null */
const headRect = root => [...(root?.parentElement?.querySelectorAll('.wlMiaCat [data-part="head"]') ?? [])].find(h => h.style?.display !== 'none')?.getBoundingClientRect() ?? null

/** Выпустить всё, что ждёт: пилюля над головой Мии → к её счётчику. Нет головы на экране / «меньше движения» — трофеи приходят на счётчик сразу */
export function lootLaunch(s) {
  clearTimeout(s.timer); s.timer = 0
  if (s.air) { drop(s); land(s) } // прежняя ещё летит — её трофеи уже у счётчика
  const n = s.wait; s.wait = 0
  if (!(n > 0)) return
  const { root, fly, num } = s.els
  const head = s.still || !num || !fly?.animate ? null : headRect(root)
  s.air = { n, a: null }
  if (!head || !(head.width > 0)) { land(s); return }
  const r = root.getBoundingClientRect(), t = num.getBoundingClientRect()
  fly.textContent = `+${n} XP`
  const from = lootStart({ head: { cx: head.left - r.left + head.width / 2, top: head.top - r.top }, w: r.width, half: { x: (fly.offsetWidth || 80) / 2, y: (fly.offsetHeight || 30) / 2 } })
  const a = fly.animate(lootFrames(from, [t.left - r.left + t.width / 2, t.top - r.top + t.height / 2]), { duration: LOOT_TOTAL_MS, easing: 'linear' }) // заливка после конца не задана: кончилась — у узла анимаций нет
  s.air.a = a
  a.onfinish = () => { if (s.air?.a === a) land(s) }
}

export function lootReset(s) { clearTimeout(s.timer); s.timer = 0; s.wait = 0; drop(s); s.air = null; paint(s) }

/** Счёт экзамена изменился (до отрисовки): show — счётчик на экране, lost — у Мии, dug — сколько слов потеряно (ошибка / молчание), missKey — lootKey(talk) */
export function lootScore(s, { show, lost, dug, missKey }) {
  const was = s.seen, wasDug = s.dug
  s.seen = show ? lost : null; s.dug = dug; s.lost = lost
  if (!show || was == null || lost <= was) { lootReset(s); return } // первый показ и сброс счёта (новый блок считает дальше, новая игра — с нуля) — без анимации
  s.wait += lost - was; paint(s)
  if (dug > wasDug) { // слово потеряно: пилюля ждёт РЕАЛЬНОГО начала колкости Мии про трофеи
    if (missKey == null || missKey === s.key) { clearTimeout(s.timer); s.timer = setTimeout(() => lootLaunch(s), LOOT_WAIT_MS); return }
    s.key = missKey
  }
  lootLaunch(s) // верный ответ в жёлтой / красной зоне (реплики про это нет) или колкость уже звучит — сразу
}

/** Мия начала реплику: колкость про трофеи — пилюля появляется над её головой */
export function lootTalk(s, missKey) {
  if (missKey == null || missKey === s.key) return
  s.key = missKey
  if (s.wait > 0) lootLaunch(s)
}
