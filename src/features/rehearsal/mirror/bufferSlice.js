// «Дубль и зеркало»: отрезок AudioBuffer [startMs, endMs) копией (v3.3.101: играем только речь без тишины по краям). Новый буфер строится конструктором AudioBuffer, а где его нет — через createBuffer
// игрового контекста (makeBuffer подставляется в тестах). Не получилось (нет конструктора, пустой отрезок) — возвращает исходный буфер: лучше сыграть всё, чем промолчать. Чистая функция, без DOM.
import { getGameCtx } from '../../../shared/lib/gameAudioCtx.js'

const defaultMake = (channels, length, rate) => {
  if (typeof AudioBuffer === 'function') { try { return new AudioBuffer({ numberOfChannels: channels, length, sampleRate: rate }) } catch { /* старый WebKit — через контекст */ } }
  return getGameCtx()?.createBuffer?.(channels, length, rate) ?? null
}

export function sliceBuffer(buffer, span, { makeBuffer = defaultMake } = {}) {
  try {
    if (!buffer || !span) return buffer
    const rate = buffer.sampleRate || 44100
    const from = Math.max(0, Math.round(span.startMs / 1000 * rate))
    const to = Math.min(buffer.length, Math.round(span.endMs / 1000 * rate))
    if (to - from < 1 || (from === 0 && to >= buffer.length)) return buffer
    const out = makeBuffer(buffer.numberOfChannels, to - from, rate)
    if (!out) return buffer
    for (let c = 0; c < buffer.numberOfChannels; c++) out.getChannelData(c).set(buffer.getChannelData(c).subarray(from, to))
    return out
  } catch { return buffer }
}
