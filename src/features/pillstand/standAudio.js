// Звук микрофона для записи стенда пилюль (CONCEPT_PILLSTAND.md): MediaRecorder на ТОМ ЖЕ игровом потоке (gameMic.js — второго getUserMedia нет). Формат — первый поддержанный из AUDIO_TYPES:
// iPhone (Safari 14.3+) пишет audio/mp4, Chromium — audio/webm;codecs=opus. Нет MediaRecorder или ни одного формата — запись без звука с причиной (why). startMs — мс сессии, когда запись пошла
// (событие start): по нему плеер ставит звук на шкалу кадров. Зависимости подставляются в тестах.
export const AUDIO_TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']

/** Первый поддержанный формат или null (MediaRecorder нет) / '' (ни один из списка — браузер выберет сам) */
export function pickAudioType(MR = globalThis.MediaRecorder) {
  if (typeof MR !== 'function') return null
  if (typeof MR.isTypeSupported !== 'function') return ''
  return AUDIO_TYPES.find(t => { try { return MR.isTypeSupported(t) } catch { return false } }) ?? ''
}

export function createAudioRec({ MR = globalThis.MediaRecorder, now = () => performance.now() } = {}) {
  let rec = null, chunks = [], startMs = null, type = null
  return {
    /** Начать писать поток stream: { ok, type } или { ok: false, why } */
    start(stream) {
      type = pickAudioType(MR)
      if (type == null) return { ok: false, why: 'нет MediaRecorder' }
      if (!stream) return { ok: false, why: 'нет потока микрофона (нажми «Старт»)' }
      try {
        rec = new MR(stream, type ? { mimeType: type } : undefined)
        chunks = []; startMs = null
        rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data) }
        rec.onstart = () => { startMs = now() }
        rec.start(1000)
        startMs ??= now()
        return { ok: true, type: rec.mimeType || type }
      } catch (e) { rec = null; return { ok: false, why: `MediaRecorder: ${e?.name ?? e}` } }
    },
    /** Остановить: промис { blob, type, startMs (performance.now) } или null */
    stop() {
      const r = rec
      rec = null
      if (!r) return Promise.resolve(null)
      return new Promise(resolve => {
        const done = () => resolve(chunks.length ? { blob: new Blob(chunks, { type: r.mimeType || type || 'audio/webm' }), type: r.mimeType || type, startMs } : null)
        r.onstop = done
        try { if (r.state !== 'inactive') r.stop(); else done() } catch { done() }
      })
    },
    active: () => !!rec,
  }
}
