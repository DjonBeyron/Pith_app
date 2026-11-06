// «Речь ждёт выныривания» (режим «Говорю» гонки): ОДНА точка ожидания перед словом следующей пилюли. Движок пилюль присылает 'pre' вместе с wait() — сколько мс Пит ещё нырает / прыгает / стоит в стороне,
// пока пилюля проходит (raceDodgeDrive.left). Директор (useRaceActs.pre) зовёт run(wait, talk): Пит уже на месте — talk сразу (обычно: нырок укладывается в отступ секвенсора raceSpeech.js 350 / 450 мс),
// иначе talk — когда он встанет на место, и строка журнала «[dodge] речь ждала выныривания N мс». Пока ждём, pending() = true: директор держит пилюлю (pitLeft), она не выезжает раньше слова.
// Страховка: дольше SURFACE_MAX_MS не ждём. cancel — смена стадии, выход. Часы и таймеры приходят аргументами (тесты).
export const SURFACE_MAX_MS = 1500

export function createSurfaceWait({ now = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout, log = () => {} } = {}) {
  let timer = 0
  let pend = false
  const self = {
    /** left — функция «сколько мс ещё ждать» (или null), fn — сказать слово. Возвращает, сколько мс ожидания было впереди (0 — сказано сразу) */
    run(left, fn) {
      self.cancel()
      const l0 = left?.() ?? 0
      if (!(l0 > 0)) { fn(); return 0 }
      pend = true
      const t0 = now()
      const loop = () => {
        timer = 0
        const waited = now() - t0, l = left() ?? 0
        if (l > 0 && waited < SURFACE_MAX_MS) { timer = setTimer(loop, Math.min(l, SURFACE_MAX_MS - waited)); return }
        pend = false
        try { log(`[dodge] речь ждала выныривания ${Math.round(waited)} мс${l > 0 ? ' (страховка: дольше не ждём)' : ''}`) } catch { /* журнал не мешает игре */ }
        fn()
      }
      timer = setTimer(loop, l0)
      return l0
    },
    pending: () => pend,
    cancel() { if (timer) clearTimer(timer); timer = 0; pend = false },
  }
  return self
}
