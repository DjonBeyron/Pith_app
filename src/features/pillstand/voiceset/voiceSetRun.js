// Запись набора «в сборе» (v3.3.188, CONCEPT_VOICESET.md): захват (voiceSetCapture.js) → числа кусков (voiceSetMeter.js) → ход записи (voiceSetSession.js) → клип: передискретизация в 16 кГц,
// WAV, запись манифеста — сразу в хранилище (voiceSetStore.js). Мини-трасса (push / subscribe) — для здоровья микрофона стенда (useStandMicHealth: 'level' с z — ровный ноль, 'listen' dead —
// звук перестал приходить: контекст захвата прерван iOS); её события, кроме уровня, копятся в meta.micEvents (уйдут в манифест). Без React: зависимости подставляются.
import { getGameMic, describeGameMic } from '../../../shared/lib/gameMic.js'
import { startCapture } from './voiceSetCapture.js'
import { createChunkMeter } from './voiceSetMeter.js'
import { createVoiceSetSession } from './voiceSetSession.js'
import { resample, encodeWav, joinChunks, SET_RATE } from './voiceSetWav.js'
import { clipEntry } from './voiceSetManifest.js'

export const STALL_MS = 1500   // столько нет кусков звука при открытом захвате — контекст встал (звонок, Siri)
export const ZERO_CHUNKS = 3   // столько кусков ровного нуля в клипе — микрофон оглох, клип не сохраняем
const MIC_EVENTS_MAX = 60

export function createMiniTrace({ now = () => performance.now() } = {}) {
  const subs = new Set(), t0 = now(), log = []
  return {
    push(k, data = {}) {
      const ev = { t: Math.round(now() - t0), k, ...data }
      if (k !== 'level') { log.push({ ...ev, at: new Date().toISOString() }); if (log.length > MIC_EVENTS_MAX) log.shift() }
      subs.forEach(f => { try { f(ev) } catch { /* подписчик не ломает запись */ } })
      return ev
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    log: () => log.slice(),
  }
}

/**
 * store — voiceSetStore; plan — сценарий; meta — запись набора (skipped, captures…); clips — уже записанные клипы; trace — мини-трасса (одна на экран: её слушает здоровье микрофона). onState(состояние хода), onLevel(game, voice) — каждый кусок звука (полоска
 * уровня, мимо React), onClips(список клипов) — после сохранения / удаления. → { session, trace, open(), close(), stalled(), clips(), meta() }
 */
export function createVoiceSetRun({ store, plan, meta: metaIn, clips: clipsIn = [], trace = createMiniTrace(), version = '', onState = () => {}, onLevel = () => {}, onClips = () => {}, getStream = getGameMic, capture = startCapture, describe = describeGameMic, now = () => performance.now() }) {
  const meter = createChunkMeter()
  let meta = { ...metaIn, skipped: [...(metaIn.skipped ?? [])], captures: [...(metaIn.captures ?? [])] }, cap = null
  const clips = new Map(clipsIn.map(c => [c.i, c]))
  const list = () => [...clips.values()].sort((a, b) => a.i - b.i)
  const saveMeta = patch => { meta = { ...meta, ...patch, micEvents: trace.log() }; return store.saveMeta(meta).catch(() => {}) }

  async function save(item, { chunks, stats, preMs }) {
    if (stats.zeros >= ZERO_CHUNKS) { trace.push('listen', { status: 'dead', why: 'ровный ноль в клипе' }); throw Object.assign(new Error('микрофон отдал тишину — клип не сохранён'), { mic: true }) }
    const rate = cap?.rate ?? SET_RATE, { bytes, clipped } = encodeWav(resample(joinChunks(chunks.map(c => c.data)), rate, SET_RATE), SET_RATE)
    const entry = clipEntry(item, stats, { srcRate: rate, sampleRate: SET_RATE, preMs, bytes: bytes.length, clipped, env: chunks.map(c => Math.round(c.rms * 1e6)), chunkMs: chunks[0]?.ms ?? 0 })
    await store.putClip(entry, bytes.buffer)
    clips.set(entry.i, entry)
    onClips(list())
  }
  const session = createVoiceSetSession({
    plan, done: clipsIn.map(c => c.i), skipped: meta.skipped, save, onState,
    drop: async i => { await store.dropClip(i); clips.delete(i); onClips(list()) },
    onSkip: skipped => { saveMeta({ skipped }) },
  })

  return {
    session, trace,
    clips: list,
    meta: () => meta,
    /** Открыть захват на игровом потоке (после openGameMic из тапа; после оживления микрофона — заново). → true / false (нет живого потока) */
    open() {
      const stream = getStream()
      if (!stream || typeof stream.then === 'function') return false
      cap?.stop(); session.resetRing()
      cap = capture({
        stream, onState: state => trace.push('ctx', { state }),
        onChunk: c => { const m = meter.push(c.rms, c.game, c.ms); trace.push('level', c.rms === 0 ? { z: 1 } : {}); onLevel(c.game, m.voice); session.chunk({ data: c.data, ...m }) },
      })
      const d = describe()
      saveMeta({ micGain: cap.gain, constraints: d.constraints ?? null, captures: [...meta.captures, { t: new Date().toISOString(), version, ctxRate: cap.rate, track: d.settings ?? null }].slice(-20) })
      return true
    },
    /** Звук перестал приходить (контекст прерван) — сторож зовёт раз в полсекунды, пока идёт запись */
    stalled: () => !!cap && now() - cap.lastAt() > STALL_MS,
    kick: () => cap?.resume(),
    rate: () => cap?.rate ?? null,
    /** Закрыть захват и ход → Promise: запись набора (пропущенные, сбои микрофона) дописана в хранилище */
    close() { cap?.stop(); cap = null; session.dispose(); return saveMeta({}) },
  }
}
