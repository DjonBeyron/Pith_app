import { useEffect, useRef, useState } from 'react'
import PitAvatar from '../../shared/ui/PitAvatar.jsx'
import { track } from '../../shared/lib/analytics/track.js'
import { MEMORY_INTRO_OPEN } from '../../shared/lib/analytics/eventNames.js'
import { MEMORY_STORY } from './memoryStoryText.js'
import { startStory } from './memoryStoryPlayer.js'
import { memoryStorySeen, markMemoryStorySeen } from './memoryStoryFlag.js'

// Первый вход во вкладку «Память» — один раз на устройстве: Пит коротко рассказывает, что здесь
// живёт. Голос — если в memoryStoryText.js задан файл озвучки; субтитры есть всегда (без звука —
// по таймеру). Внизу «Дальше» (пропустить) и после последней фразы — кнопка из текста рассказа.
// open — вкладка на экране (в скрытой вкладке рассказ не идёт и не звучит);
// onDone — рассказ закончен или закрыт (флаг уже поставлен)
const SHOWN = 3 // не больше трёх строк на экране: текущая и две прошедшие бледнее

export default function MemoryStory({ open, onDone }) {
  const { lines, audioUrl, cta } = MEMORY_STORY
  const [show, setShow] = useState(() => !memoryStorySeen())
  const [idx, setIdx] = useState(0)
  const [done, setDone] = useState(false)
  const player = useRef(null)
  const active = open && show

  useEffect(() => {
    if (!active) return undefined
    track(MEMORY_INTRO_OPEN, { voice: !!audioUrl })
    player.current = startStory({ lines, audioUrl, onLine: setIdx, onEnd: () => setDone(true) })
    return () => { player.current?.stop(); player.current = null; setIdx(0); setDone(false) }
  }, [active, lines, audioUrl])

  if (!active) return null

  function close() {
    player.current?.stop()
    markMemoryStorySeen()
    setShow(false)
    onDone?.()
  }

  const from = Math.max(0, idx - (SHOWN - 1))
  return (
    <div className="lrSheetBack" onClick={close}>
      <div className="lrSheet memStory" role="dialog" aria-label="Пит рассказывает о Памяти" onClick={e => e.stopPropagation()}>
        <div className="memStoryPit"><PitAvatar size={56} /></div>
        <div className="memStoryLines" aria-live="polite">
          {lines.slice(from, idx + 1).map((text, k) => (
            <p key={from + k} className={`memStoryLine${from + k === idx ? ' memStoryLine--now' : ''}`}>{text}</p>
          ))}
        </div>
        {done
          ? <button className="lrCta memStoryCta" onClick={close}>{cta}</button>
          : <button className="lrBtn lrBtnGhost memStoryNext" onClick={() => player.current?.skip()}>Дальше</button>}
      </div>
    </div>
  )
}
