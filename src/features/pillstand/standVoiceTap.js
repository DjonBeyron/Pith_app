// «Прослушка» Vosk для стенда пилюль: обёртка над startListening (voskEngine.js) — тот же движок, те же колбэки, но каждое сырое событие распознавателя уходит в трассу стенда:
// 'vosk-partial' { raw: { partial } } (каждый черновик, повтор того же текста — 'same'), 'vosk-final' { raw: { text, result: [{ word, conf, start, end }] } (setWords) + stopBy и тайминги захода },
// 'gate' { open, rms } (затвор тишины voskGate), 'level' { rms } (каждый кусок звука), 'vosk-ready', 'vosk-error', 'vosk-start' { grammar } — какой словарь отдан модели. Слушателю игры (wordLaneListen.js) всё
// передаётся как есть: стенд ничего не меняет в распознавании, только смотрит. Чистая функция над подставляемым listen.
import { startListening } from '../../shared/lib/vosk/voskEngine.js'

const STAT_KEYS = ['firstPartialMs', 'resultMs', 'afterStopMs', 'chunks', 'micMs', 'readyMs', 'audioStartMs', 'stopBy', 'loadPct', 'tailMs', 'drainMs', 'chunkMs', 'maxGapMs', 'lateChunks', 'gatedMs']

/** → listen(model, grammar, cb, opts) для createWordListener({ listen }); trace — createStandTrace */
export function tapListen(trace, listen = startListening) {
  return (model, grammar, cb, opts = {}) => {
    let last = null
    trace.push('vosk-start', { grammar: (() => { try { return JSON.parse(grammar) } catch { return grammar } })(), gate: !!opts.gate })
    const wrapped = {
      ...cb,
      onReady: info => { trace.push('vosk-ready', { micMs: info?.micMs ?? null }); cb.onReady?.(info) },
      onLevel: rms => { trace.push('level', { rms: Math.round(rms * 10000) / 10000 }); cb.onLevel?.(rms) },
      onPartial: raw => { if (raw === last) trace.push('same', { raw: { partial: raw } }); else { last = raw; trace.push('vosk-partial', { raw: { partial: raw } }) } cb.onPartial(raw) },
      onResult: (text, stats) => {
        const st = {}
        for (const k of STAT_KEYS) if (stats?.[k] != null) st[k] = stats[k]
        trace.push('vosk-final', { raw: { text, result: stats?.words ?? [] }, ...st })
        last = null
        cb.onResult(text, stats)
      },
      onError: msg => { trace.push('vosk-error', { msg: String(msg) }); cb.onError(msg) },
    }
    const onGate = (open, rms) => { trace.push('gate', { open: !!open, rms: Math.round((Number(rms) || 0) * 10000) / 10000 }); opts.onGate?.(open, rms) }
    return listen(model, grammar, wrapped, { ...opts, onGate })
  }
}
