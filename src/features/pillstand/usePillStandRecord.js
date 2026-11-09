import { useState, useRef, useEffect, useCallback } from 'react'
import { peekGameMic } from '../../shared/lib/gameMic.js'
import { createRecorder, WARN_MS } from './pillStandRecorder.js'
import { createFillWatch } from './standFillWatch.js'
import { createAudioRec } from './standAudio.js'
import { snapPillEl } from './pillStandSnap.js'

// Кадр стенда пилюль и запись (CONCEPT_PILLSTAND.md): ОДИН rAF на стенд — «слово → заливка дошла» (standFillWatch.js → событие 'reach'), полоска уровня (пишется в DOM, без React) и, во время записи,
// снимок кадра (pillStandSnap.js: только чтение DOM пилюли, без клонирования) в рекордер (pillStandRecorder.js: ≤ 60 к/с, ≤ 3 мин) + звук микрофона MediaRecorder (standAudio.js, тот же поток).
// Стоп — запись { frames, events (трасса за время записи ± 0,5 с), audio { blob, url, type, startMs }, fps, ms } для плеера и выгрузки. → { rec, state, start, stop, rmsRef }.
const r4 = v => (v == null ? null : Math.round(v * 10000) / 10000)
const PAD_MS = 500
const UI_MS = 250

export default function usePillStandRecord({ trace, probe, ear, viewing = false }) {
  const [recorder] = useState(() => createRecorder())
  const [watch] = useState(() => createFillWatch())
  const [rec, setRec] = useState(null)
  const [state, setState] = useState({ on: false, ms: 0, fps: 0, warn: false, audio: '' })
  const audio = useRef(null), rmsRef = useRef(null), stopRef = useRef(null), count = useRef(0)

  useEffect(() => {
    let seen = new Set() // слова цели, уже отмеченные: подтверждение итогом (draft: false) заливку не двигает
    return trace.subscribe(e => {
      if (e.k === 'target') { watch.reset(); seen = new Set() }
      else if (e.k === 'word' && !e.gone && !seen.has(e.index)) { seen.add(e.index); watch.word(e.t, e.text ?? 'слово', probe.goal ?? 0) }
      else if (e.k === 'word' && e.gone) seen.delete(e.index)
      else if (e.k === 'pill' && e.type === 'claim') watch.word(e.t, e.text ?? 'слово', probe.goal ?? 0)
    })
  }, [trace, watch, probe])

  useEffect(() => {
    if (viewing) return undefined
    let id = 0, uiAt = 0
    const loop = ts => {
      const t = ts != null ? trace.rel(ts) : trace.now() // метка кадра rAF (ровная шкала 60 Гц), а не момент вызова — на медленном устройстве кадры не «склеиваются» и не теряются
      if (probe.goal != null) for (const r of watch.frame(t, probe.goal, probe.shown ?? 0)) trace.push('reach', r)
      const bar = rmsRef.current
      if (bar) bar.style.setProperty('--rms', Math.min(1, Math.sqrt(ear.rms || 0) * 2.2).toFixed(3))
      if (recorder.on()) {
        const el = probe.el?.isConnected ? probe.el : null
        const r = recorder.add(t, { s: snapPillEl(el), g: r4(probe.goal), v: r4(probe.shown), e: { p: ear.partial, f: ear.final, gate: ear.gate, rms: ear.rms, lv: r4(probe.level) } })
        if (r === true) count.current++
        if (r === 'full') stopRef.current?.('потолок 3 минуты')
        else if (t - uiAt > UI_MS) { uiAt = t; const ms = recorder.elapsed(t); setState(s => ({ ...s, ms, fps: ms > 0 ? Math.round((count.current / ms) * 1000) : 0, warn: ms > WARN_MS })) }
      }
      id = requestAnimationFrame(loop)
    }
    id = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(id)
  }, [viewing, trace, probe, ear, recorder, watch])

  const start = useCallback(() => {
    if (recorder.on()) return
    count.current = 0
    recorder.start(trace.now())
    const a = createAudioRec()
    audio.current = a
    const r = a.start(peekGameMic())
    const why = r.ok ? r.type : `без звука: ${r.why}`
    trace.push('rec-start', { audio: why })
    setState({ on: true, ms: 0, fps: 0, warn: false, audio: why })
  }, [recorder, trace])

  const stop = useCallback(async (why = 'стоп') => {
    if (!recorder.on() && !recorder.full()) return
    recorder.stop()
    const t1 = trace.now()
    const got = await audio.current?.stop()
    audio.current = null
    const frames = recorder.frames(), t0 = recorder.startedAt()
    const ms = Math.round(t1 - t0)
    const all = trace.events()
    const lastTarget = all.findLastIndex(e => e.k === 'target' && e.t < t0), pad = all.findIndex(e => e.t >= t0 - PAD_MS)
    const from = lastTarget >= 0 ? Math.min(lastTarget, pad < 0 ? all.length : pad) : Math.max(0, pad) // запись начата посреди цели — её 'target' и всё после него тоже в записи (сводке нужна цель)
    const events = all.slice(from).filter(e => e.t <= t1 + PAD_MS)
    const snd = got ? { ...got, startMs: trace.rel(got.startMs), url: URL.createObjectURL(got.blob) } : null
    const fps = ms > 0 ? Math.round((frames.length / ms) * 10000) / 10 : 0
    trace.push('rec-stop', { why, frames: frames.length, ms, fps, audio: snd ? `${snd.type}, ${snd.blob.size} байт` : 'нет' })
    const got2 = { frames, events, audio: snd, fps, ms, t0, why }
    if (globalThis.__pillStand?.trace === trace) globalThis.__pillStand.rec = got2 // автопроверка записи и плеера
    setRec(old => { if (old?.audio?.url) URL.revokeObjectURL(old.audio.url); return got2 })
    setState(s => ({ ...s, on: false }))
  }, [recorder, trace])
  useEffect(() => { stopRef.current = stop }, [stop])

  useEffect(() => () => { recorder.stop(); audio.current?.stop() }, [recorder])
  useEffect(() => () => { if (rec?.audio?.url) URL.revokeObjectURL(rec.audio.url) }, [rec])

  return { rec, state, start, stop, rmsRef }
}
