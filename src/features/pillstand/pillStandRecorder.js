// Запись кадров стенда пилюль (CONCEPT_PILLSTAND.md): каждый кадр rAF — лёгкий объект { t, i, s (снимок пилюли, pillStandSnap.js), g (цель заливки), v (экран), e (панель Vosk: черновик, итог, затвор, rms) }.
// Кадров не чаще FRAME_MIN_MS (≈ 60/с), запись не длиннее MAX_MS (3 минуты): дальше add отвечает 'full' и кадры не копятся. t — мс сессии (та же шкала, что у событий трассы). Чистый модуль.
export const MAX_MS = 180000
export const WARN_MS = 150000 // за 30 с до конца — предупреждение на кнопке
export const FRAME_MIN_MS = 1000 / 60 - 1.5

export function createRecorder({ maxMs = MAX_MS, minMs = FRAME_MIN_MS } = {}) {
  let frames = [], t0 = null, last = -Infinity, full = false, on = false
  return {
    start(t) { frames = []; t0 = t; last = -Infinity; full = false; on = true },
    stop() { on = false },
    /** Кадр в момент t (мс сессии): true — записан, false — рано (чаще 60/с) или запись не идёт, 'full' — вышло MAX_MS */
    add(t, data) {
      if (!on || full) return false
      if (t - t0 > maxMs) { full = true; on = false; return 'full' }
      if (t - last < minMs) return false
      last = t
      frames.push({ t: Math.round(t * 10) / 10, i: frames.length, ...data })
      return true
    },
    frames: () => frames,
    startedAt: () => t0,
    elapsed: t => (t0 == null ? 0 : t - t0),
    on: () => on,
    full: () => full,
  }
}
