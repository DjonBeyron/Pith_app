// «Дубль и зеркало»: кнопка «Сравнить» — сначала играет диктор (dictor.play(), пилюли верхней полосы загораются по таймингам), потом запись человека (<audio>, нижняя полоса). Во время игры
// phase !== 'idle' (кнопка показывает «…»); повторно можно. Подсветка — таймеры по расписанию litSchedule от начала звука; остановка/выход из экрана гасит всё и ставит запись на паузу.
import { useState, useRef, useCallback, useEffect } from 'react'
import { litSchedule } from './mirrorLane.js'

const IDLE_LIT = { d: -1, s: -1 }
const TAIL_MS = 1500 // запасной выход, если <audio> не сообщил о конце

export function useMirrorPlayback({ dictor, student, view, audioRef }) {
  const [phase, setPhase] = useState('idle')
  const [lit, setLit] = useState(IDLE_LIT)
  const timers = useRef([])
  const run = useRef(0)
  const busy = useRef(false)

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
      if (typeof dictor?.play === 'function') {
        setPhase('dictor')
        schedule('d', view.dictor.pills, Number(dictor.leadMs) || 0)
        try { await dictor.play() } catch { /* диктор не заиграл — переходим к записи */ }
        clear()
        if (!alive()) return
        setLit(IDLE_LIT)
      }
      const a = audioRef.current
      if (a && student?.url && view.student) {
        setPhase('student')
        await new Promise(resolve => {
          const finish = () => { a.removeEventListener('ended', finish); a.removeEventListener('error', finish); resolve() }
          a.addEventListener('ended', finish)
          a.addEventListener('error', finish)
          timers.current.push(setTimeout(finish, (Number(student.durationMs) || 0) + TAIL_MS))
          try { a.currentTime = 0 } catch { /* ещё не загружен */ }
          Promise.resolve(a.play()).then(() => { if (alive()) schedule('s', view.student.pills, 0) }, finish)
        })
        clear()
        if (!alive()) return
        try { audioRef.current?.pause() } catch { /* уже остановлен */ }
        setLit(IDLE_LIT)
      }
    } finally {
      if (alive()) { busy.current = false; setPhase('idle') }
    }
  }, [dictor, student, view, audioRef, schedule, clear])

  return { phase, lit, start }
}
