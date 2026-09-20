import { pLog } from '../../../../shared/lib/debug.js'

// Дебаг рассинхрона голосового (жалоба: зелёная заливка и печать текста
// отстают от звука, бывает — не идут вовсе при играющем звуке; таймер при
// появлении пузыря показывает 00:00). Цель — в скачанном логе сверить не
// только цифры ct/total, но и то, что нельзя увидеть глазами:
//  · [audio-hb] раз в 0.5с: ct, СКОРОСТЬ хода currentTime относительно часов
//    (rate=1.00 — норма; <1 — элемент «тянет» время, хотя звук слышен),
//    readyState/буфер, сколько символов раскрыто и в каком режиме печать
//    (timings — по таймингам слов от звука, auto — своим таймером, когда
//    таймингов у ноды нет: тогда текст с звуком не связан вообще);
//  · [audio-gap] — провал между кадрами цикла >100мс (главный поток был занят:
//    визуально заливка и текст в этот момент стоят);
//  · [audio-ev] — waiting/stalled/suspend/ratechange/seeking самого <audio>.

export function logAudioMount({ src, storedWaveform, storedDuration }) {
  pLog(`[audio-mount] src=${src ?? 'NULL'} storedWaveform=${storedWaveform?.length ?? 0}pts storedDuration=${storedDuration ?? '—'}`)
}

export function logAudioDurationReady(source, value) {
  pLog(`[audio-dur] duration готов (${source}): ${value != null ? value.toFixed(3) + 's' : 'null'}`)
}

export function logAudioPlayStart({ d, liveDuration, readyState, networkState, waveLen, textLen, timings, bounds }) {
  const live = Number.isFinite(liveDuration) ? liveDuration.toFixed(3) + 's' : String(liveDuration)
  pLog(`[audio-play] старт: d(сохранённая)=${d.toFixed(3)}s audio.duration(живая)=${live} `
    + `readyState=${readyState} networkState=${networkState} waveData=${waveLen ?? 0}pts `
    + `text=${textLen}симв печать=${textLen ? (timings ? 'timings(' + timings + ')' : 'по доле речи — таймингов нет') : '—'} `
    + `тишина=${bounds ? 'старт ' + bounds.lead.toFixed(2) + 's / хвост ' + bounds.tail.toFixed(2) + 's' : 'не определена'}`)
}

function bufferedEnd(a) {
  try { return a.buffered.length ? a.buffered.end(a.buffered.length - 1) : 0 } catch { return 0 }
}

// Throttled раз в ~0.5с — иначе кадр записывал бы лог 60 раз в секунду.
// Возвращает функцию-замыкание — своя на каждый play(). rate — отношение
// пройденного ct к пройденному времени часов между двумя записями
export function makeAudioHeartbeat() {
  let lastCt = -1, lastWall = 0
  return (audio, ct, total, wave, chars) => {
    const wall = performance.now()
    if (lastCt >= 0 && ct - lastCt < 0.5) return
    const rate = lastCt >= 0 && wall > lastWall ? ((ct - lastCt) * 1000 / (wall - lastWall)).toFixed(2) : '—'
    lastCt = ct; lastWall = wall
    const progress = total > 0 ? ct / total : 0
    pLog(`[audio-hb] ct=${ct.toFixed(2)}s total=${total.toFixed(2)}s прогресс=${(progress * 100).toFixed(0)}% rate=${rate} `
      + `rs=${audio.readyState} buf=${bufferedEnd(audio).toFixed(1)}s paused=${audio.paused} `
      + `полоски=${wave ? `${wave.green}/${wave.count} w=${wave.width}px` : '—'} символы=${chars ?? '—'}`)
  }
}

// Провал между кадрами цикла: главный поток был занят чем-то другим, и всё,
// что рисует цикл (заливка, таймер, раскрытие текста), в это время стояло
export function makeGapWatch() {
  let last = 0
  return (now, ct) => {
    if (last && now - last > 100) pLog(`[audio-gap] кадр через ${(now - last).toFixed(0)}мс при ct=${ct.toFixed(2)}s`)
    last = now
  }
}

const AUDIO_EVENTS = ['waiting', 'stalled', 'suspend', 'ratechange', 'seeking', 'playing', 'emptied', 'error']

export function attachAudioEventLog(audio) {
  const handlers = AUDIO_EVENTS.map(ev => {
    const h = () => pLog(`[audio-ev] ${ev} ct=${audio.currentTime.toFixed(2)}s rs=${audio.readyState} rate=${audio.playbackRate}`)
    audio.addEventListener(ev, h)
    return [ev, h]
  })
  return () => handlers.forEach(([ev, h]) => audio.removeEventListener(ev, h))
}

export function logAudioEnded({ ct, liveDuration, d }) {
  // Та же формула выбора total, что в tick() (AudioModule.jsx) — иначе цифры
  // тут и там разъедутся и сравнивать станет не с чем
  const total = (Number.isFinite(liveDuration) && liveDuration > 0 ? liveDuration : d) || 1
  const live  = Number.isFinite(liveDuration) ? liveDuration.toFixed(3) + 's' : String(liveDuration)
  pLog(`[audio-end] onEnded: ct=${ct.toFixed(3)}s audio.duration=${live} total(считали по нему)=${total.toFixed(3)}s `
    + `разница_ct-total=${(ct - total).toFixed(3)}s`)
}
