import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { frameAt, stepFrame, loopRange, advance } from './pillStandPlayer.js'
import { applySnap } from './pillStandSnap.js'

// Плеер записи стенда пилюль: номер кадра, ▶ / ⏸, скорость, луп отрезка [a, b] (по умолчанию вся запись), шаг ◀ ▶ (и стрелки клавиатуры, пробел — пауза), звук синхронно с кадрами
// (audio — ref элемента <audio> плеера; пока звук играет, часы — его currentTime + startMs; иначе — реальное время × скорость). Кадр рисуется из снимка (applySnap) на пилюле плеера pillRef. → состояние и команды для PillStandPlayer.jsx.
const KICK_MS = 300 // звук ещё не заиграл (play() ждёт) — не дёргаем его чаще

export default function useStandPlayer(rec, pillRef, audioRef) {
  const frames = useMemo(() => rec?.frames ?? [], [rec])
  const [idx, setIdx] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [loop, setLoop] = useState(true)
  const [range, setRange] = useState(null)
  const t = useRef(frames[0]?.t ?? 0)
  const span = loopRange(frames, range)

  useEffect(() => { applySnap(pillRef.current, frames[idx]?.s ?? null) }, [idx, frames, pillRef])

  const syncAudio = useCallback((play = playing) => {
    const a = audioRef.current, snd = rec?.audio
    if (!a || !snd) return
    const at = (t.current - snd.startMs) / 1000
    try { a.playbackRate = speed } catch { /* скорость звука не поддержана — звук идёт как есть */ }
    try { if (Math.abs(a.currentTime - at) > 0.06) a.currentTime = Math.max(0, at) } catch { /* не перематывается — играет откуда может */ }
    if (play && at >= 0 && (!Number.isFinite(a.duration) || at < a.duration)) a.play().catch(() => {}); else a.pause()
  }, [rec, speed, playing, audioRef])

  useEffect(() => {
    if (!playing || !frames.length) return undefined
    let id = 0, last = performance.now(), kick = -Infinity
    const tick = now => {
      const a = audioRef.current, snd = rec?.audio
      if (a && snd && a.paused && now - kick > KICK_MS) { const at = (t.current - snd.startMs) / 1000; if (at >= 0 && (!Number.isFinite(a.duration) || at < a.duration - 0.05)) { kick = now; syncAudio(true) } } // запись звука началась позже первого кадра — звук включается, когда до него дошли
      const byAudio = a && snd && !a.paused && a.currentTime > 0
      const step = advance(t.current, now - last, speed, span, loop)
      last = now
      if (byAudio && !step.wrap) step.t = Math.min(span[1], snd.startMs + a.currentTime * 1000)
      t.current = step.t
      if (step.wrap) syncAudio(true)
      setIdx(frameAt(frames, t.current))
      if (step.end) { setPlaying(false); audioRef.current?.pause(); return }
      id = requestAnimationFrame(tick)
    }
    syncAudio(true)
    id = requestAnimationFrame(tick)
    const el = audioRef.current
    return () => { cancelAnimationFrame(id); el?.pause() }
  }, [playing, speed, loop, span[0], span[1], frames, rec, syncAudio, audioRef]) // eslint-disable-line react-hooks/exhaustive-deps -- span — пара чисел

  const go = useCallback(i => { setPlaying(false); const k = Math.max(0, Math.min(frames.length - 1, i)); t.current = frames[k]?.t ?? 0; setIdx(k); syncAudio(false) }, [frames, syncAudio])
  const step = useCallback(dir => go(stepFrame(frameAt(frames, t.current), dir, frames.length)), [frames, go])
  const toggle = useCallback(() => setPlaying(p => { if (!p && t.current >= span[1]) t.current = span[0]; return !p }), [span])
  const seek = useCallback(ms => go(frameAt(frames, ms)), [frames, go])

  useEffect(() => {
    const onKey = e => { if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) } else if (e.key === 'ArrowRight') { e.preventDefault(); step(1) } else if (e.key === ' ') { e.preventDefault(); toggle() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, toggle])

  return { frames, idx, frame: frames[idx] ?? null, playing, speed, setSpeed, loop, setLoop, range, setRange, span, step, toggle, seek, go }
}
