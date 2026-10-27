// Выравнивание полёта пилюль диктора по звуку. Пилюли едут на композиторе (wordLaneMotion.js) с СОВЕРШЕННО ровной скоростью, и менять её каждый кадр нельзя: каждое обновление скорости —
// синхронизация с композитором, а на смартфонах она давала подлагивание, особенно в начале, когда звук только заиграл. Поэтому выравниваем РЕДКО и разово, а не непрерывно:
//  1) звук зазвучал позже плана (декодирование) — файл перематывается вперёд на опоздание (skip: в тишине перед первым словом, слово не обрезается);
//  2) через SETTLE_MS после этого остаток расхождения гасится ОДНОЙ короткой «подкруткой»: скорость 1 ± NUDGE_RATE на время |err| / NUDGE_RATE, затем снова ровно 1 (nudge: два обновления скорости);
//  3) крупный разрыв (> JUMP_MS: звук встал, перемотан) — разовый сдвиг (jump);
//  4) дальше раз в RECHECK_MS проверка, и только если расхождение больше MIN_ERR_MS — новая подкрутка. Обычно за всю фазу 2–3 действия, а не 60 в секунду.
// Скорость голоса урока ≠ 1 сюда не заходит: план растянут на неё заранее (wordLanePlan, rate), а currentTime приводится к времени плана (audioMs / rate) вызывающим. Чистая логика без DOM.
export const NUDGE_RATE = 0.05   // скорость подкрутки: 0,95…1,05 (глазом незаметно)
export const MIN_ERR_MS = 25     // меньше — не трогаем (расхождение до ~25 мс на слух и глаз не различимо)
export const JUMP_MS = 350       // больше — не подкрутка, а разовый сдвиг
export const SETTLE_MS = 160    // после первого звука / перемотки даём измерению устояться
export const RECHECK_MS = 700   // как часто сверяемся потом
export const SMOOTH_MS = 120    // сглаживание измерений currentTime (у телефонов он обновляется рывками)

export function createAligner() {
  let ema = null
  let since = null      // когда началось текущее измерение
  let nextCheck = 0
  let skipped = false
  return {
    /**
     * planMs — где картинка в плане, audioMs — currentTime файла в мс плана (null — звука нет), audioAt — когда по плану зазвучит файл, now — часы вызывающего (мс), dt — мс с прошлого кадра.
     * Возвращает null (ничего не делать) или действие: { type: 'skip', ms } | { type: 'nudge', ms (со знаком: >0 — картинку ускорить), rate, hold } | { type: 'jump', ms }.
     */
    step({ planMs, audioMs = null, audioAt = 0, now, dt = 16 }) {
      if (audioMs == null) { ema = null; since = null; return null }
      const err = audioAt + audioMs - planMs                       // >0 — картинка отстаёт от звука
      const k = 1 - Math.exp(-Math.max(0, dt) / SMOOTH_MS)
      ema = ema == null ? err : ema + (err - ema) * k
      if (since == null) {
        since = now; nextCheck = Math.max(nextCheck, now + SETTLE_MS)       // после подкрутки ждём её конца (nextCheck уже стоит позже)
        if (-err > MIN_ERR_MS && !skipped) { skipped = true; ema = null; since = null; return { type: 'skip', ms: -err } }
        return null
      }
      if (now < nextCheck) return null
      nextCheck = now + RECHECK_MS
      if (Math.abs(ema) > JUMP_MS) { const ms = ema; ema = null; since = null; return { type: 'jump', ms } }
      if (Math.abs(ema) < MIN_ERR_MS) return null
      const hold = Math.abs(ema) / NUDGE_RATE
      nextCheck = now + hold + RECHECK_MS
      const out = { type: 'nudge', ms: ema, rate: 1 + Math.sign(ema) * NUDGE_RATE, hold }
      ema = null; since = null
      return out
    },
  }
}

/** Файл играет по-настоящему: элемент есть, не на паузе, не закончился и время пошло */
export function audioPlayingMs(el) {
  if (!el || el.paused || el.ended) return null
  const ms = el.currentTime * 1000
  return ms > 0 ? ms : null
}
