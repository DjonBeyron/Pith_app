// «Дубль и зеркало»: запись дубля — фраза целиком, MediaRecorder на ГОТОВОМ потоке игры (gameMic.getGameMic / openGameMic; getUserMedia здесь не зовётся — второго диалога разрешения нет).
// Запись живёт только в памяти (Blob + objectURL), никуда не отправляется; releaseTake освобождает ссылку. Те же куски звука параллельно слушает Vosk (stream общий) — это даёт слова с таймингами.
// Сбой записи (нет MediaRecorder, поток мёртв, пустой файл) не бросает из recordTake: handle.ok === false, а stop() отклоняется ошибкой с кодом (err.code: 'no-recorder' | 'dead-stream' | 'failed' | 'empty' | 'cancelled'),
// чтобы сценарий обрабатывал сбой в одном месте — вокруг await stop().
import { analyzeBlob } from './mirrorRms.js'
import { pickTakeMime } from './takeMime.js'

export const MAX_TAKE_MS = 8000

const fail = (code, msg) => Object.assign(new Error(msg || code), { code })
const hasLiveTrack = stream => { try { return !!stream && stream.getTracks().some(t => t.readyState === 'live') } catch { return false } }

/**
 * recordTake({ stream, maxMs = 8000, mimeType? }) → { ok, error, stop(): Promise<Take>, cancel() }.
 * Take = { blob, url (objectURL), durationMs, rms (0..1, средний RMS голоса по WebAudio) }. stop() можно звать повторно (тот же промис); запись сама останавливается через maxMs — stop() тогда вернёт готовый дубль.
 * mimeType не задан — pickTakeMime (формат, который и пишется, и играет в <audio>: на iPhone mp4, а не webm); log(строка) получает «rec-start mime=… (почему)».
 * deps (для тестов): Recorder (класс вместо MediaRecorder), analyze (вместо decodeAudioData), now, canPlayType.
 */
export function recordTake({ stream, maxMs = MAX_TAKE_MS, mimeType, log = () => {} } = {}, deps = {}) {
  const Recorder = deps.Recorder ?? (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null)
  const analyze = deps.analyze ?? analyzeBlob
  const now = deps.now ?? (() => Date.now())
  const broken = code => {
    const p = Promise.reject(fail(code)); p.catch(() => {})
    return { ok: false, error: code, stop: () => p, cancel() {} }
  }
  if (!Recorder) return broken('no-recorder')
  if (!hasLiveTrack(stream)) return broken('dead-stream')
  let rec
  let why = 'задан вызывающим'
  try {
    if (!mimeType) ({ mimeType, why } = pickTakeMime({ Recorder, canPlayType: deps.canPlayType }))
    const ok = mimeType && typeof Recorder.isTypeSupported === 'function' ? Recorder.isTypeSupported(mimeType) : !!mimeType
    rec = ok ? new Recorder(stream, { mimeType }) : new Recorder(stream)
  } catch { return broken('failed') }

  const parts = []
  let timer = 0
  let cancelled = false
  let startedAt = 0
  let endedAt = 0
  let settle = null
  const done = new Promise((resolve, reject) => { settle = { resolve, reject } })
  done.catch(() => {}) // отмена/сбой без подписчика — не «необработанный отказ»

  const halt = () => { clearTimeout(timer); try { if (rec.state !== 'inactive') rec.stop() } catch { /* уже остановлен */ } }
  rec.ondataavailable = e => { if (e?.data?.size) parts.push(e.data) }
  rec.onerror = () => { clearTimeout(timer); settle.reject(fail('failed')) }
  rec.onstop = async () => {
    clearTimeout(timer)
    endedAt = now()
    if (cancelled) { settle.reject(fail('cancelled')); return }
    try {
      const blob = new Blob(parts, { type: rec.mimeType || mimeType || 'audio/webm' })
      if (!blob.size) throw fail('empty')
      const info = await analyze(blob) // длительность из декодированного звука точнее часов: MediaRecorder пишет webm без длины
      settle.resolve({ blob, mime: blob.type, url: URL.createObjectURL(blob), durationMs: info?.durationMs ?? Math.max(0, endedAt - startedAt), rms: info?.rms ?? 0 })
    } catch (e) { settle.reject(e?.code ? e : fail('failed', e?.message)) }
  }
  try { startedAt = now(); rec.start(); try { log(`[take] rec-start mime=${rec.mimeType || mimeType || 'по умолчанию'} (${why})`) } catch { /* журнал не мешает записи */ } timer = setTimeout(halt, Math.max(200, Number(maxMs) || MAX_TAKE_MS)) } catch { return broken('failed') }

  return {
    ok: true,
    error: null,
    stop() { halt(); return done },
    cancel() { cancelled = true; halt(); if (rec.state === 'inactive' && !endedAt) settle.reject(fail('cancelled')) },
  }
}

/** Освободить дубль: objectURL отзывается (звук в памяти больше не нужен) */
export function releaseTake(take) {
  try { if (take?.url) URL.revokeObjectURL(take.url) } catch { /* уже отозван */ }
}
