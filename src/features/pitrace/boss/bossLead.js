// Финал «Шкала памяти»: пилюля выезжает ДО слова Пита (владелец, v3.3.270: «когда Пит говорит слово, пилюля уже должна выехать и быть видна на экране»).
// В других ступенях Пит начинает слово вместе с выездом (пилюля «досказывает» к своему 50 %, wordLaneConveyorSpeed.spawnEarly), здесь слово ждёт, пока пилюля выедет наполовину
// (halfTravelMs: центр на верхнем краю экрана) — слово звучит над уже видимой пилюлей. Чистые функции и таймер без React: проверяются в консоли.
import { halfTravelMs } from '../../player/modules/rotate-phone/wordLaneConveyorSpeed.js'

/** Сколько мс слово ждёт после выезда пилюли: у финала — путь пилюли до 50 % видимости, у остальных ступеней — 0 */
export const bossLeadMs = (act, speed) => (act === 'boss' ? Math.round(halfTravelMs(speed)) : 0)

/** То же для пилюли, перед которой Пит сказал «Следующее слово» (после ошибки / «не успел»; отметку mb.next ставит raceMia.applyMia): 0 — слово звучит сразу за репликой, в миг выезда пилюли
 *  (владелец 2026-11-22: «убирать паузу между „Следующее слово“ и самим словом»). Отметка разовая: первое слово блока и слово после верного ответа ждут выезда, как раньше */
export function leadAfter(mb, act, speed) { const next = !!mb?.next; if (mb) mb.next = false; return next ? 0 : bossLeadMs(act, speed) }

/** Один отложенный вызов (слово ждёт выезда): run(ms, fn) — fn через ms (0 — сразу); cancel() — снять (ответ принят раньше слова, смена стадии, пауза) */
export function createLeadTimer({ setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let t = 0
  const cancel = () => { if (t) clearTimer(t); t = 0 }
  return {
    run(ms, fn) { cancel(); if (!(ms > 0)) { fn(); return } t = setTimer(() => { t = 0; fn() }, ms) },
    cancel,
    pending: () => t !== 0,
  }
}
