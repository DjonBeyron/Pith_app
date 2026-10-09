// Менеджер «параллельного» потока микрофона для пробы «Голос» (режимы B/C). Без React: всё окружение передаётся снаружи.
// Поток привязан к attemptId: open() для новой попытки закрывает предыдущую, close(id) освобождает микрофон
// (треки stop(), AudioContext.close(), таймер уровня) и идемпотентен. Ошибка getUserMedia попытку НЕ блокирует.
import {
  getCaptureConstraints, rmsFromBytes, nextPeak, METER_MS, MAX_OPEN_MS, FFT_SIZE,
} from './speechCapture.js'

export const idleCapture = { status: 'off', mode: 'plain', level: 0, peak: 0, error: null, agc: null }

const stopStream = s => { try { s?.getTracks?.().forEach(t => { try { t.stop() } catch { /* уже остановлен */ } }) } catch { /* ничего */ } }

export function createCaptureManager({
  getUserMedia, createAudioContext, onState = () => {}, setIntervalFn = setInterval, clearIntervalFn = clearInterval,
}) {
  let h = null              // текущий поток: { id, mode, closed, stream, ctx, timer, peak, level, samples, error, agc }
  const finished = new Map() // id → итог закрытого потока (последние несколько)

  const emit = (patch = {}) => {
    onState(h
      ? { status: h.error ? 'error' : h.timer ? 'live' : 'opening', mode: h.mode, level: h.level, peak: h.peak, error: h.error, agc: h.agc, ...patch }
      : { ...idleCapture, ...patch })
  }
  const info = c => ({ id: c.id, mode: c.mode, peak: c.samples ? c.peak : null, error: c.error, agc: c.agc })

  function close(id) {
    if (!h || (id != null && h.id !== id)) return id != null ? finished.get(id) ?? null : null
    const c = h
    h = null
    c.closed = true
    clearIntervalFn(c.timer); c.timer = null
    stopStream(c.stream)
    try { c.src?.disconnect() } catch { /* ничего */ }
    try { Promise.resolve(c.ctx?.close?.()).catch(() => {}) } catch { /* ничего */ }
    const res = info(c)
    finished.set(c.id, res)
    if (finished.size > 8) finished.delete(finished.keys().next().value)
    onState({ status: 'ended', mode: c.mode, level: 0, peak: c.peak, error: c.error, agc: c.agc, hadSamples: c.samples > 0 })
    return res
  }

  function startMeter(c, stream) {
    c.stream = stream
    const track = stream.getAudioTracks?.()[0]
    try { c.agc = track?.getSettings?.().autoGainControl ?? null } catch { /* getSettings нет */ }
    try {
      c.src = c.ctx.createMediaStreamSource(stream)
      const an = c.ctx.createAnalyser()
      an.fftSize = FFT_SIZE
      c.src.connect(an)
      const buf = new Uint8Array(an.fftSize)
      let ticks = 0
      c.timer = setIntervalFn(() => {
        if (c.closed) return
        if (++ticks * METER_MS > MAX_OPEN_MS) { close(c.id); return }
        try { if (c.ctx.state === 'suspended') c.ctx.resume?.() } catch { /* ничего */ }
        an.getByteTimeDomainData(buf)
        c.level = rmsFromBytes(buf)
        c.peak = nextPeak(c.peak, c.level)
        c.samples++
        emit()
      }, METER_MS)
    } catch (e) { // поток открылся, но замерить уровень нельзя — поток всё равно держим до конца попытки
      c.error = `meter:${e?.name || 'error'}`
    }
    emit()
  }

  return {
    /** Вызывать СИНХРОННО в жесте тапа (перед recognition.start()), не дожидаясь результата */
    open(id, mode) {
      close() // смена попытки: прежний поток закрываем
      const constraints = getCaptureConstraints(mode)
      if (!constraints) { onState({ ...idleCapture, mode }); return }
      const c = { id, mode, closed: false, stream: null, ctx: null, src: null, timer: null, peak: 0, level: 0, samples: 0, error: null, agc: null }
      h = c
      try { c.ctx = createAudioContext?.() ?? null; c.ctx?.resume?.() } catch { c.ctx = null } // в жесте, иначе iOS держит контекст «suspended»
      emit()
      let p
      try { p = getUserMedia(constraints) } catch (e) { p = Promise.reject(e) }
      Promise.resolve(p).then(stream => {
        if (c.closed) { stopStream(stream); return } // попытка уже закончилась — поток не нужен
        if (!c.ctx) { c.stream = stream; c.error = 'meter:no-audiocontext'; emit(); return }
        startMeter(c, stream)
      }).catch(e => {
        if (c.closed) return
        c.error = e?.name || 'getUserMedia'
        emit()
      })
    },
    close,
    /** Итог потока этой попытки (после close) */
    result: id => finished.get(id) ?? null,
  }
}
