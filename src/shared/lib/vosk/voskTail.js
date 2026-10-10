// Тишина в хвост записи для Vosk (см. комментарий про хвост речи в voskTiming.js). Чистая по сути функция: берёт распознаватель и частоту, ничего не знает про микрофон.
// Библиотека vosk-browser принимает звук двумя способами: acceptWaveformFloat(Float32Array, rate) и acceptWaveform(AudioBuffer) (внутри зовёт первый) — берём тот, что есть.

/** Досыпать в распознаватель ms миллисекунд тишины (нулевые сэмплы). Возвращает, сколько мс реально отправлено (0 — не вышло или ms ≤ 0); сбой отправки не роняет остановку */
export function feedSilence(rec, sampleRate, ms) {
  const rate = sampleRate > 0 ? sampleRate : 16000
  const n = Math.round((rate * ms) / 1000)
  if (!(n > 0) || !rec) return 0
  const zeros = new Float32Array(n)
  try {
    if (typeof rec.acceptWaveformFloat === 'function') rec.acceptWaveformFloat(zeros, rate)
    else rec.acceptWaveform({ getChannelData: () => zeros, sampleRate: rate, duration: n / rate, length: n, numberOfChannels: 1 })
    return ms
  } catch { return 0 }
}
