import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import VoskReadyNotice from '../../../shared/ui/VoskReadyNotice.jsx'
import { useVoskReady } from '../../../shared/lib/vosk/useVoskReady.js'
import { closeGameMic, openGameMic } from '../../../shared/lib/gameMic.js'
import { ensureMicAccess, micNeedsHold } from '../../../shared/lib/micAccess.js'
import { track } from '../../../shared/lib/analytics/track.js'
import { SAY_ALOUD_ROUND } from '../../../shared/lib/analytics/eventNames.js'
import { sendSayAloudResult } from '../../../shared/api/sayAloudApi.js'
import SayAloudGame from './SayAloudGame.jsx'
import SayAloudResult from './SayAloudResult.jsx'
import { roundResult } from './sayAloudRound.js'

// Полноэкранный слой мини-игры «Скажи вслух» (portal в body поверх всего, как «Повтори за диктором»): сначала проверка готовности Vosk (модель в памяти или уведомление «Нужно скачать» —
// useVoskReady + VoskReadyNotice, один механизм на все места), готово — экран «Начать»: по его тапу (это жест) уходит запрос микрофона, потом игра и итог. Микрофон не просим, пока модели нет. Крестик — выйти в любой момент.
// Распознавание только Vosk: не готов — уведомление, системное не подставляется. Конец раунда: событие say_aloud_round (слов, найдено, мс) и итог в память — промах = слово завтра, XP с дневным потолком (sayAloudApi).
export default function SayAloudOverlay({ words, onClose }) {
  const vosk = useVoskReady()
  const [mic, setMic] = useState('idle')   // idle (ещё не просили) | pending | granted | denied | unavailable
  const [result, setResult] = useState(null)
  const [xp, setXp] = useState(0) // награда с сервера: приходит после показа итога, строка «+N XP» появляется, только если N > 0

  const aliveRef = useRef(true)
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false } }, [])
  useEffect(() => () => closeGameMic(), []) // iPhone: поток открыт на весь раунд — закрываем при выходе (индикатор микрофона гаснет)
  // Тап «Начать» — жест: запрос микрофона уходит сразу, до любых await (iPhone — один поток на весь раунд, gameMic; остальные — доступ запоминается)
  const begin = () => {
    setMic('pending')
    const asked = micNeedsHold() ? openGameMic() : ensureMicAccess()
    asked.then(r => { if (aliveRef.current) setMic(r || 'unavailable') })
  }

  const finished = useCallback(({ answers, ms }) => {
    closeGameMic()
    const r = roundResult(answers)
    track(SAY_ALOUD_ROUND, { words: r.words, hits: r.hits, ms })
    setResult(r)
    sendSayAloudResult(r.items).then(res => { if (aliveRef.current && res?.xp > 0) setXp(res.xp) }).catch(() => {})
  }, [])

  let body
  if (result) body = <SayAloudResult result={result} xp={xp} onClose={onClose} />
  else if (vosk.status !== 'ready') body = <div className="sayCenter"><VoskReadyNotice vosk={vosk} /></div>
  else if (mic === 'idle') {
    body = (
      <div className="sayCenter" data-testid="say-start">
        <p className="sayTitle">Скажи слово вслух</p>
        <p className="saySub">Я покажу перевод — назови слово по-английски. Слов в раунде: {words.length}, не больше полутора минут</p>
        <button type="button" className="sayBtn" onClick={begin} data-testid="say-begin">Начать</button>
      </div>
    )
  } else if (mic === 'pending') body = <div className="sayCenter"><p className="saySub">Включаю микрофон…</p></div>
  else if (mic !== 'granted') {
    body = (
      <div className="sayCenter" data-testid="say-nomic">
        <p className="sayTitle">Нужен микрофон</p>
        <p className="saySub">Без него я не услышу слова. Разреши микрофон в настройках браузера и запусти игру снова</p>
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
