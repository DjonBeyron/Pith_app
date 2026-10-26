// Часы фазы диктора: пилюли и заливка идут по ЗВУКУ, но КАРТИНКА ВСЕГДА ТЕЧЁТ РОВНО. Раньше время брали прямо из currentTime файла — а он на телефонах обновляется рывками (шаги 20–250 мс),
// поэтому пилюли дёргались и «втыкались». Теперь время картинки = таймер (ровно, 60 к/с) + поправка (drift) — расхождение «звук минус таймер», которое сглаживается медленным фильтром
// (постоянная TAU_MS) и ограничено по скорости: картинка может идти чуть быстрее/медленнее обычного (не больше MAX_RATE от скорости), но не останавливается, не прыгает и не идёт назад.
// Скорость голоса урока ≠ 1 сюда не заходит: план слов растянут на неё заранее (wordLanePlan, rate), а currentTime приводится к времени плана (audioMs / rate) вызывающим.
export const TAU_MS = 450
export const MAX_RATE = 0.1   // картинка идёт со скоростью 0,9…1,1 от обычной, пока подстраивается под звук

/**
 * Один кадр часов. tTimer — время по таймеру (мс от старта фазы), audioMs — currentTime файла в мс времени плана, если файл играет (иначе null), audioAt — когда по плану зазвучит файл,
 * drift — накопленная поправка, dt — мс с прошлого кадра. Возвращает { t, drift }: t — время фазы для картинки. Нет звука (ещё не начался или уже кончился) — поправка не меняется.
 */
export function syncClock({ tTimer, audioMs = null, audioAt = 0, drift = 0, dt = 16 }) {
  if (audioMs == null) return { t: tTimer + drift, drift }
  const step = Math.max(0, dt)
  const want = audioAt + audioMs - tTimer                        // какой должна быть поправка, чтобы картинка совпала со звуком
  const move = (want - drift) * (1 - Math.exp(-step / TAU_MS))   // медленно подтягиваем…
  const next = drift + Math.min(MAX_RATE * step, Math.max(-MAX_RATE * step, move)) // …не быстрее MAX_RATE
  return { t: tTimer + next, drift: next }
}

/** Файл играет по-настоящему: элемент есть, не на паузе, не закончился и время пошло */
export function audioPlayingMs(el) {
  if (!el || el.paused || el.ended) return null
  const ms = el.currentTime * 1000
  return ms > 0 ? ms : null
}
