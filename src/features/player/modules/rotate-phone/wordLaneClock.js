// Подстройка полёта пилюль диктора под звук. Пилюли едут на композиторе (wordLaneMotion.js), поэтому «часы» — это скорость анимации: пока файл озвучки играет, расхождение «где звук в плане минус
// где картинка» (err) мягко гасится изменением скорости полёта (не больше ±MAX_RATE — глазом незаметно, пилюля не «тормозит» и не прыгает); currentTime у телефонов обновляется рывками, поэтому err
// предварительно сглаживается (SMOOTH_MS). Совсем крупный разрыв (звук встал/перемотан, больше JUMP_MS) — разовый скачок. Скорость голоса урока ≠ 1 сюда не заходит: план растянут на неё заранее
// (wordLanePlan, rate), а currentTime приводится к времени плана (audioMs / rate) вызывающим. Чистая логика без DOM.
export const TAU_MS = 900      // за такое время гасится e-ая часть расхождения (скорость = 1 + err / TAU_MS, не выше MAX_RATE)
export const MAX_RATE = 0.05   // скорость полёта 0,95…1,05
export const SMOOTH_MS = 200   // сглаживание измерений currentTime
export const JUMP_MS = 350     // больше — не подстраиваем скоростью, а сдвигаем разом

export function createRateController() {
  let ema = null
  return {
    /**
     * planMs — где картинка в плане сейчас, audioMs — currentTime файла в мс времени плана (null — звука нет), audioAt — когда по плану зазвучит файл, dt — мс с прошлого вызова.
     * Возвращает { rate, jump }: rate — скорость полёта, jump — на сколько мс сдвинуть картинку разом (0 — не надо).
     */
    step({ planMs, audioMs = null, audioAt = 0, dt = 16 }) {
      if (audioMs == null) { ema = null; return { rate: 1, jump: 0 } }
      const err = audioAt + audioMs - planMs
      if (Math.abs(err) > JUMP_MS) { ema = null; return { rate: 1, jump: err } }
      const k = 1 - Math.exp(-Math.max(0, dt) / SMOOTH_MS)
      ema = ema == null ? err : ema + (err - ema) * k
      return { rate: 1 + Math.min(MAX_RATE, Math.max(-MAX_RATE, ema / TAU_MS)), jump: 0 }
    },
  }
}

/** Файл играет по-настоящему: элемент есть, не на паузе, не закончился и время пошло */
export function audioPlayingMs(el) {
  if (!el || el.paused || el.ended) return null
  const ms = el.currentTime * 1000
  return ms > 0 ? ms : null
}
