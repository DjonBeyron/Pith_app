import { useState, useRef, useEffect } from 'react'
import { playWordSlot } from './wordLaneClips.js'
import { lineKey, lineMs, LINE_PAUSE_MS, LINE_COOLDOWN_MS } from './wordLaneCatLines.js'
import { mouthTrack } from './wordLaneVisemes.js'

const TEXT_TAIL_MS = 900 // подпись держится ещё столько после конца реплики

// Реплики кота (wordLaneCatLines.js) в игре: sayLine(id) — кот говорит реплику: подпись на экране, озвучка из слота (подготовлен в тапе «Начать»), рот по буквам текста; микрофон на это время
// «не слушает» (динамик не должен засчитаться голосом). Нет озвучки — только подпись. Одну и ту же реплику не чаще LINE_COOLDOWN_MS, две подряд не накладываются. Возвращает { text, sayLine }:
// text — подпись, пока реплика звучит (пусто — нет).
export function useCatLines({ lines, rate, catApi, listenerRef }) {
  const [text, setText] = useState('')
  const lastRef = useRef(new Map()) // id → когда последний раз говорил
  const busyRef = useRef(0)
  const timerRef = useRef(0)
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const sayLine = id => {
    const line = lines?.[id]
    const now = Date.now()
    if (!line || now < busyRef.current || now - (lastRef.current.get(id) ?? -Infinity) < LINE_COOLDOWN_MS) return false
    const ms = lineMs(line, rate)
    const voiced = !!line.url && playWordSlot(lineKey(id))
    lastRef.current.set(id, now)
    busyRef.current = now + ms + LINE_PAUSE_MS
    setText(line.text)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setText(''), ms + TEXT_TAIL_MS)
    if (voiced) { listenerRef?.current?.mute?.(ms + LINE_PAUSE_MS); catApi?.current?.speak?.(mouthTrack(line.text, ms, line.words), ms) } else catApi?.current?.peek?.(ms + 400)
    return true
  }

  return { text, sayLine }
}
