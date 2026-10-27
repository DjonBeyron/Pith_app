import { useState, lazy, Suspense } from 'react'
import { Mic } from 'lucide-react'
import { ensureMicAccess, micNeedsHold } from '../../../shared/lib/micAccess.js'
import { openGameMic } from '../../../shared/lib/gameMic.js'
import { pickRoundWords, canSayAloud, MIN_TO_SHOW } from './sayAloudRound.js'

// Кнопка запуска мини-игры «Скажи вслух». Два места: вкладка «Память» (variant 'tab': вторичная кнопка под главным действием, в «Памяти пора отдыхать» — единственное) и окно слова
// (variant 'sheet', withWord — раунд со словом и другими). Видна, когда в памяти есть хотя бы MIN_TO_SHOW слов с переводом, годных для Vosk (sayAloudRound.canSayAloud).
// Тап — жест: прямо в нём (до любых await) уходит запрос микрофона (iPhone — один поток на весь раунд, gameMic; остальные — доступ запоминается), промис отдаём слою. Датчик движения не нужен:
// игра вертикальная, телефон не переворачиваем. Сам слой (Пит, дорожки, Vosk) грузится отдельным куском только по тапу — вкладка «Память» его не тянет.
const SayAloudOverlay = lazy(() => import('./SayAloudOverlay.jsx'))

export default function SayAloudLaunch({ view, withWord = null, variant = 'tab' }) {
  const [round, setRound] = useState(null) // null | { words, mic }
  if (!canSayAloud(view, withWord)) return null

  function start() {
    const words = pickRoundWords(view, { min: MIN_TO_SHOW, withWord })
    if (words.length < MIN_TO_SHOW) return
    const mic = micNeedsHold() ? openGameMic() : ensureMicAccess() // в жесте: запрос микрофона, ответ — в слое
    setRound({ words, mic })
  }

  return (
    <>
      <button type="button" className={`sayLaunch sayLaunch--${variant}`} onClick={start} data-testid="say-aloud-launch">
        <Mic size={16} aria-hidden="true" />
        <span>Скажи вслух</span>
      </button>
      {round && (
        <Suspense fallback={null}>
          <SayAloudOverlay words={round.words} mic={round.mic} onClose={() => setRound(null)} />
        </Suspense>
      )}
    </>
  )
}
