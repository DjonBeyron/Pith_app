// «Дубль и зеркало»: сравнение — сначала играет диктор (dictor.play(), кусок на дорожках загорается по таймингам), потом запись человека. Запись (с v3.3.87) играет Web Audio с выравниванием громкости
// (playTakeBuffer → GainNode, takeGain.js: дубль с микрофона тише голоса Пита), а <audio> — запасной путь, если буфер не декодировался или контекст игры не запустился. Во время игры phase !== 'idle'
// (кнопка показывает «…»); повторно можно. lit = { d, s } — номер звучащего куска диктора / человека (−1 — никакой): по нему MirrorCompare зажигает пилюлю на дорожках. Подсветка — таймеры по расписанию
// litSchedule (mirrorSpans.js: spans — отрезки кусков обеих записей) от начала звука; остановка/выход гасит всё и ставит запись на паузу.
// onSound({ side: 'pit' | 'you', delayMs, durationMs }) — звук стороны пошёл (по нему наливается горизонтальная подложка ленты); onSound(null) — новое прослушивание, подложки пустые.
import { useState, useRef, useCallback, useEffect } from 'react'
import { litSchedule } from './mirrorSpans.js'
import { playTakeBuffer } from './takeBuffer.js'

const IDLE_LIT = { d: -1, s: -1 }
const TAIL_MS = 1500 // запасной выход, если <audio> не сообщил о конце
const TRIM_TAIL_MS = 60 // у обрезанной записи (student.trim) конец — по таймеру: durationMs уже без тишины
export const NO_PLAY_TEXT = 'Запись не воспроизводится на этом устройстве' // ни буфер Web Audio, ни <audio> не сыграли запись

export function useMirrorPlayback({ dictor, student, spans, audioRef, targetRms = null, onSound = null }) {
  const [phase, setPhase] = useState('idle')
  const [lit, setLit] = useState(IDLE_LIT)
  const timers = useRef([])
  const run = useRef(0)
  const busy = useRef(false)
  const viaAudio = useRef(false) // буфер Web Audio эту запись не сыграл: дальше сразу <audio>
  const [problem, setProblem] = useState('')

  const clear = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = [] }, [])
  const schedule = useCallback((lane, pills, offset) => {
    for (const ev of litSchedule(pills, offset)) {
      timers.current.push(setTimeout(() => setLit(p => (ev.on ? { ...p, [lane]: ev.i } : p[lane] === ev.i ? { ...p, [lane]: -1 } : p)), ev.at))
    }
  }, [])

  useEffect(() => () => { run.current += 1; clear(); try { audioRef.current?.pause() } catch { /* уже остановлен */ } }, [clear, audioRef])

  const start = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    const id = ++run.current
    const alive = () => id === run.current
    try {
      onSound?.(null)
      if (typeof dictor?.play === 'function') {
        setPhase('dictor')
        const lead = Number(dictor.leadMs) || 0
        schedule('d', spans.dictor, lead)
        onSound?.({ side: 'pit', delayMs: lead, durationMs: Number(dictor.durationMs) || 0 })
        try { await dictor.play() } catch { /* диктор не заиграл — переходим к записи */ }
        clear()
        if (!alive()) return
        setLit(IDLE_LIT)
      }
      const a = audioRef.current
      if ((a || student?.blob) && student?.url && spans.student) {
        setPhase('student'); setProblem('')
        const begin = () => { if (!alive()) return; schedule('s', spans.student, 0); onSound?.({ side: 'you', delayMs: 0, durationMs: Number(student.durationMs) || 0 }) }
        let played = false
        if (student.blob && !viaAudio.current) { // основной путь: Web Audio с выравниванием громкости
          const res = await playTakeBuffer(student.blob, { targetRms, onStart: begin, trim: student.trim ?? null })
          clear()
          if (!alive()) return
          played = res === 'ended'
          if (!played) viaAudio.current = true
        }
        if (!played && a) { // запасной путь: <audio> (громкость не меняется)
          played = await new Promise(resolve => {
            let failed = false
            const finish = () => { a.removeEventListener('ended', finish); a.removeEventListener('error', fail); resolve(!failed) }
            const fail = () => { failed = true; finish() }
            a.addEventListener('ended', finish)
            a.addEventListener('error', fail)
            timers.current.push(setTimeout(finish, (Number(student.durationMs) || 0) + (student.trim ? TRIM_TAIL_MS : TAIL_MS))) // с обрезкой <audio> сам не остановится на её конце — гасим по таймеру
            try { a.currentTime = (student.trim?.startMs ?? 0) / 1000 } catch { /* ещё не загружен */ }
            Promise.resolve(a.play()).then(begin, fail) // iPhone: NotSupportedError на webm/opus
          })
          clear()
          if (!alive()) return
          try { audioRef.current?.pause() } catch { /* уже остановлен */ }
        }
        if (!played) setProblem(NO_PLAY_TEXT)
        setLit(IDLE_LIT)
      }
    } finally {
      if (alive()) { busy.current = false; setPhase('idle') }
    }
  }, [dictor, student, spans, audioRef, targetRms, onSound, schedule, clear])

  return { phase, lit, start, problem }
}
