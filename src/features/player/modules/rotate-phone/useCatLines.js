import { useState, useRef, useEffect } from 'react'
import { LINE_PAUSE_MS, LINE_COOLDOWN_MS } from './wordLaneCatLines.js'
import { startCatLine } from './wordLaneCatSay.js'

const TEXT_TAIL_MS = 900 // подпись держится ещё столько после конца реплики

// Реплики кота (wordLaneCatLines.js) в игре: sayLine(id) — кот говорит реплику: подпись на экране, озвучка из слота (подготовлен в тапе «Начать»), рот по буквам текста, микрофон на это время «не слушает»
// (динамик не должен засчитаться голосом). Как именно стартует звук и рот — wordLaneCatSay.js (голова спрятана — сначала выскакивает; нет озвучки — только подпись), здесь — когда: одну и ту же реплику не чаще
// LINE_COOLDOWN_MS, две подряд не накладываются. Возвращает { text, sayLine, stop }: text — подпись, пока реплика звучит (пусто — нет); stop — оборвать реплику (пауза).
export function useCatLines({ lines, rate, catApi, listenerRef }) {
  const [text, setText] = useState('')
  const lastRef = useRef(new Map()) // id → когда последний раз говорил
  const busyRef = useRef(0)
  const timerRef = useRef(0)
  const riseRef = useRef(0)
  useEffect(() => () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current) }, [])

  const sayLine = id => {
    const line = lines?.[id]
    const now = Date.now()
    if (!line || now < busyRef.current || now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) return false
    clearTimeout(riseRef.current)
    const { ms, rise, timer } = startCatLine({ id, line, rate, catApi, listenerRef })
    riseRef.current = timer
    lastRef.current.set(id, now)
    busyRef.current = now + rise + ms + LINE_PAUSE_MS
    setText(line.text)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setText(''), rise + ms + TEXT_TAIL_MS)
    return true
  }

  /** Пауза: реплика обрывается — подпись и таймеры сняты, «занят» сброшен (после «Продолжить» кот снова может говорить); звук слота гасит releaseClips, рот и взгляд — catApi.freeze */
  const stop = () => { clearTimeout(timerRef.current); clearTimeout(riseRef.current); busyRef.current = 0; setText('') }

  return { text, sayLine, stop }
}
