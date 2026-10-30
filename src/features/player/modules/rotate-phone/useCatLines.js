import { useState, useRef, useEffect } from 'react'
import { LINE_PAUSE_MS, LINE_COOLDOWN_MS } from './wordLaneCatLines.js'
import { startCatLine } from './wordLaneCatSay.js'
import { lineReadiness, waitForLine, LINE_WAIT_MS } from './wordLaneLineGate.js'
import { fillLine } from '../../../rehearsal/rehearsalLines.js'

const TEXT_TAIL_MS = 900 // подпись держится ещё столько после конца реплики

// Реплики кота (wordLaneCatLines.js) в игре: sayLine(id) — кот говорит реплику: подпись на экране, озвучка из слота (подготовлен в тапе «Начать»), рот по буквам текста, микрофон на это время «не слушает»
// (динамик не должен засчитаться голосом). Как именно стартует звук и рот — wordLaneCatSay.js (голова спрятана — сначала выскакивает; нет озвучки — только подпись), здесь — когда: одну и ту же реплику не чаще
// LINE_COOLDOWN_MS, две подряд не накладываются. Возвращает { text, sayLine, stop, busyLeft }: text — подпись, пока реплика звучит (пусто — нет); stop — оборвать реплику (пауза); busyLeft() — сколько мс кот ещё занят.
// sayLine(id, vars): в тексте реплики {word} заменяется на vars.word (реплики Пита-тренера; такая реплика подписью, без озвучки — fillLine).
// Начало игры (iPhone): озвученная реплика не стартует, пока прогрев не закончен и слот реплики не готов (wordLaneLineGate.js) — ждёт до LINE_WAIT_MS (подпись и рот появляются вместе со звуком); не дождалась —
// говорит голос системы, причина в журнале «[cat-voice]». Для вызывающего sayLine в обоих случаях true («реплика принята»), кот занят на время ожидания.
export function useCatLines({ lines, rate, catApi, listenerRef }) {
  const [text, setText] = useState('')
  const lastRef = useRef(new Map()) // id → когда последний раз говорил
  const busyRef = useRef(0)
  const timerRef = useRef(0)
  const riseRef = useRef(0)
  const gateRef = useRef(null) // отмена ожидания слота
  const cancelGate = () => { gateRef.current?.(); gateRef.current = null }
  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); cancelGate() }, [])

  const speak = (id, line, extra = {}) => {
    gateRef.current = null
    const now = Date.now()
    clearTimeout(riseRef.current)
    const { ms, rise, timer } = startCatLine({ id, line, rate, catApi, listenerRef, ...extra })
    riseRef.current = timer
    busyRef.current = now + rise + ms + LINE_PAUSE_MS
    setText(line.text)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setText(''), rise + ms + TEXT_TAIL_MS)
  }

  const sayLine = (id, vars = null) => {
    const line = fillLine(lines?.[id], vars)
    const now = Date.now()
    if (!line || now < busyRef.current || now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) return false
    lastRef.current.set(id, now)
    if (!line.url) { speak(id, line); return true } // нет озвучки — подпись, ждать нечего
    const check = () => lineReadiness(id)
    if (check().ready) { speak(id, line); return true }
    busyRef.current = now + LINE_WAIT_MS + 100 // ждём слот: другие реплики не лезут вперёд
    cancelGate()
    gateRef.current = waitForLine(check, {
      onReady: waited => speak(id, line, { waitedMs: waited }),
      onTimeout: (waited, why) => speak(id, line, { voice: 'synth', waitedMs: waited, why }),
    })
    return true
  }

  /** Пауза: реплика обрывается — подпись и таймеры сняты, «занят» сброшен (после «Продолжить» кот снова может говорить); звук слота гасит releaseClips, рот и взгляд — catApi.freeze */
  const stop = () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); cancelGate(); busyRef.current = 0; setText('') }

  const busyLeft = () => Math.max(0, busyRef.current - Date.now())

  return { text, sayLine, stop, busyLeft }
}
