// «Прослушка» Vosk для стенда пилюль: обёртка над startListening (voskEngine.js) — тот же движок, те же колбэки, но каждое сырое событие распознавателя уходит в трассу стенда:
// 'vosk-partial' { raw: { partial } } (каждый черновик, повтор того же текста — 'same'), 'vosk-final' { raw: { text, result: [{ word, conf, start, end }] } (setWords) + stopBy и тайминги захода },
// 'gate' { open, rms } (затвор тишины voskGate), 'level' { rms } (каждый кусок звука), 'vosk-ready', 'vosk-error', 'vosk-start' { grammar } — какой словарь отдан модели. Слушателю игры (wordLaneListen.js) всё
// передаётся как есть: стенд ничего не меняет в распознавании, только смотрит. Чистая функция над подставляемым listen.
// МЕТКА ГОЛОСА (v3.3.187): каждый 'level' несёт v — 1 / 0: назвал ли этот кусок голосом счётчик слушателя (voskVoice.js — тот же, что у правила слова и затвора; до этого отчёт мерил голос своей
// константой 0,015 и тихую речь iPhone 0,003–0,005 писал «тишиной»); на первом куске голоса — n (шум микрофона); у вертикальной пилюли ещё lv — уровень, который кусок дал анимации (0…1), и
// g — усиление уровня (wordLaneVoiceLevel.js; нет — ×1). Событие пишется ПОСЛЕ слушателя: счётчик уже посчитал этот кусок.
import { startListening } from '../../shared/lib/vosk/voskEngine.js'

const STAT_KEYS = ['firstPartialMs', 'resultMs', 'afterStopMs', 'chunks', 'micMs', 'readyMs', 'audioStartMs', 'stopBy', 'loadPct', 'tailMs', 'drainMs', 'chunkMs', 'maxGapMs', 'lateChunks', 'gatedMs', 'voiceMs', 'gatedVoiceMs', 'agcMax']

const rnd = (v, k) => Math.round(v * k) / k

/** Метка куска для 'level': voice() — счётчик слушателя (listener.voice; нет — метки нет: голос по запасному порогу), level() — createVoiceLevel().info у вертикальной пилюли */
export function voiceMark(voice, level = null) {
  let was = 0
  return rms => {
    const c = voice()
    if (!c?.heard) return {}
    const v = c.heard() ? 1 : 0, i = level?.(), mine = i && i.rms === rms
    const out = { v, ...(v && !was ? { n: rnd(c.noise(), 1e5) } : {}), ...(mine && i.level > 0 ? { lv: rnd(i.level, 1e3) } : {}), ...(mine && i.gain > 1 ? { g: rnd(i.gain, 10) } : {}) }
    was = v
    return out
  }
}

/** → listen(model, grammar, cb, opts) для createWordListener({ listen }); trace — createStandTrace; mark(rms) — метка голоса куска (voiceMark) */
export function tapListen(trace, listen = startListening, mark = null) {
  return (model, grammar, cb, opts = {}) => {
    let last = null
    trace.push('vosk-start', { grammar: (() => { try { return JSON.parse(grammar) } catch { return grammar } })(), gate: !!opts.gate })
    const wrapped = {
      ...cb,
      onReady: info => { trace.push('vosk-ready', { micMs: info?.micMs ?? null }); cb.onReady?.(info) },
      onLevel: rms => { cb.onLevel?.(rms); trace.push('level', { rms: rnd(rms, 1e4), ...(rms === 0 ? { z: 1 } : {}), ...mark?.(rms) }) }, // z — ровно 0 (оглохший поток; не путать с округлением тихого шума)
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
    const onGate = (open, rms) => { trace.push('gate', { open: !!open, rms: rnd(Number(rms) || 0, 1e4) }); opts.onGate?.(open, rms) }
    return listen(model, grammar, wrapped, { ...opts, onGate })
  }
}
