import { pLog } from '../../../../shared/lib/debug.js'
import { measureBarVisibility } from './audioWaveParts.js'

// Дебаг рассинхрона голосового (жалоба: зелёная заливка спектра стартует/
// кончается не в такт настоящему аудио, а тайминг «0:03» рядом с волной
// иногда отрисовывается позже, чем сам пузырь уже виден в чате). Цель — в
// скачанном логе сверить МОМЕНТЫ: когда пузырь смонтировался (см. соседний
// pLog в AudioModule.jsx), когда РЕАЛЬНО стал известен duration (сразу из
// метаданных или асинхронно из probeAudioDuration), когда стартовало
// воспроизведение, и как расходятся audio.currentTime/duration по кадрам.

export function logAudioMount({ src, storedWaveform, storedDuration }) {
  pLog(`[audio-mount] src=${src ?? 'NULL'} storedWaveform=${storedWaveform?.length ?? 0}pts storedDuration=${storedDuration ?? '—'}`)
}

export function logAudioDurationReady(source, value) {
  pLog(`[audio-dur] duration готов (${source}): ${value != null ? value.toFixed(3) + 's' : 'null'}`)
}

export function logAudioPlayStart({ d, liveDuration, readyState, networkState, waveLen }) {
  const live = Number.isFinite(liveDuration) ? liveDuration.toFixed(3) + 's' : String(liveDuration)
  pLog(`[audio-play] старт: d(сохранённая)=${d.toFixed(3)}s audio.duration(живая)=${live} `
    + `readyState=${readyState} networkState=${networkState} waveData=${waveLen ?? 0}pts`)
}

// Throttled раз в ~0.5с (как td-hb у таблицы-диктора) — иначе кадр записывал
// бы лог 60 раз в секунду. Возвращает функцию-замыкание — своя на каждый play()
export function makeAudioHeartbeat() {
  let last = -1
  return (ct, total, barCount) => {
    if (last >= 0 && ct - last < 0.5) return
    last = ct
    const progress = total > 0 ? ct / total : 0
    pLog(`[audio-hb] ct=${ct.toFixed(2)}s total=${total.toFixed(2)}s прогресс=${(progress * 100).toFixed(0)}% зелёных_баров=${Math.floor(progress * barCount)}/${barCount}`)
  }
}

export function logAudioEnded({ ct, liveDuration, d }) {
  // Та же формула выбора total, что в tick() (AudioModule.jsx) — иначе цифры
  // тут и там разъедутся и сравнивать станет не с чем
  const total = (Number.isFinite(liveDuration) && liveDuration > 0 ? liveDuration : d) || 1
  const live  = Number.isFinite(liveDuration) ? liveDuration.toFixed(3) + 's' : String(liveDuration)
  pLog(`[audio-end] onEnded: ct=${ct.toFixed(3)}s audio.duration=${live} total(считали по нему)=${total.toFixed(3)}s `
    + `разница_ct-total=${(ct - total).toFixed(3)}s`)
}

// Пользователь верно заметил: прошлые логи сверяли ЦИФРЫ (ct/duration), но
// не то, что РЕАЛЬНО видно на экране — а если дорожка (overflow:hidden)
// физически чуть уже, чем нужно всем барам (или массив рефов ещё не
// догнал реальную плотность после пересчёта ширины), лишние бары либо
// обрезаны, либо их вовсе нет в DOM (null в массиве). Возвращает число
// РЕАЛЬНО видимых баров — AudioModule.jsx считает от него greenUpTo,
// вместо barElsRef.current.length (см. measureBarVisibility)
export function logAudioBarClipping(waveRowRef, barElsRef) {
  const m = measureBarVisibility(waveRowRef, barElsRef)
  const real = m.visible + m.clipped + m.hidden
  pLog(`[audio-bars] код=${m.barCount} баров (реально в DOM=${real}), дорожка width=${m.rowWidth.toFixed(1)}px right=${m.rowRight.toFixed(1)} | `
    + `визуально: целиком_видно=${m.visible} обрезан_частично=${m.clipped} скрыт_целиком=${m.hidden} последний_бар_right=${m.lastBarRight.toFixed(1)}`)
  return m.visible
}
