import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import VoskReadyNotice from '../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../shared/lib/vosk/useVoskReady.js'
import { closeGameMic } from '../../../shared/lib/gameMic.js'
import { track } from '../../../shared/lib/analytics/track.js'
import { SAY_ALOUD_ROUND } from '../../../shared/lib/analytics/eventNames.js'
import SayAloudGame from './SayAloudGame.jsx'
import SayAloudResult from './SayAloudResult.jsx'
import { roundResult } from './sayAloudRound.js'

// Полноэкранный слой мини-игры «Скажи вслух» (portal в body поверх всего, как «Повтори за диктором»): сначала проверка готовности Vosk (модель в памяти или уведомление «Нужно скачать» —
// useVoskReady + VoskReadyNotice, один механизм на все места), потом микрофон (его запрос ушёл в тапе кнопки — mic: промис), потом сама игра и итог. Крестик — выйти в любой момент.
// Распознавание только Vosk: не готов — уведомление, системное не подставляется. Результат раунда в память и XP пока НЕ пишется: только событие say_aloud_round (слов, найдено, мс).
export default function SayAloudOverlay({ words, mic: micPromise, onClose }) {
  const vosk = useVoskReady()
  const [mic, setMic] = useState('pending')   // pending | granted | denied | unavailable
  const [result, setResult] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.resolve(micPromise).then(r => { if (alive) setMic(r || 'unavailable') })
    return () => { alive = false }
  }, [micPromise])
  useEffect(() => () => closeGameMic(), []) // iPhone: поток открыт на весь раунд — закрываем при выходе (индикатор микрофона гаснет)

  const finished = useCallback(({ answers, ms }) => {
    closeGameMic()
    const r = roundResult(answers)
    track(SAY_ALOUD_ROUND, { words: r.words, hits: r.hits, ms })
    setResult(r)
  }, [])

  let body
  if (result) body = <SayAloudResult result={result} onClose={onClose} />
  else if (vosk.status !== 'ready') body = <div className="sayCenter"><VoskReadyNotice vosk={vosk} /></div>
  else if (mic === 'pending') body = <div className="sayCenter"><p className="saySub">Включаю микрофон…</p></div>
  else if (mic !== 'granted') {
    body = (
      <div className="sayCenter" data-testid="say-nomic">
        <p className="sayTitle">Нужен микрофон</p>
        <p className="saySub">Без него Пит не услышит слова. Разреши микрофон в настройках браузера и запусти игру снова</p>
        <button type="button" className="sayBtn" onClick={onClose}>Закрыть</button>
      </div>
    )
  } else body = <SayAloudGame words={words} onFinished={finished} onClose={onClose} />

  return createPortal(
    <div className="wl say" data-testid="say-aloud">
      <div className="wlStage">{body}</div>
      <button type="button" className="wlClose" onClick={onClose} aria-label="Закрыть" data-testid="say-close"><X size={20} /></button>
    </div>,
    document.body,
  )
}
