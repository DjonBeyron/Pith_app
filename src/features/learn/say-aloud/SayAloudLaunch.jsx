import { useState, lazy, Suspense } from 'react'
import { Mic } from 'lucide-react'
import { pickRoundWords, canSayAloud, MIN_TO_SHOW } from './sayAloudRound.js'

// Кнопка запуска мини-игры «Скажи вслух». Два места: вкладка «Память» (variant 'tab': вторичная кнопка под главным действием, в «Памяти пора отдыхать» — единственное) и окно слова
// (variant 'sheet', withWord — раунд со словом и другими). Видна, когда в памяти есть хотя бы MIN_TO_SHOW слов с переводом, годных для Vosk (sayAloudRound.canSayAloud).
// Тап открывает слой, микрофон здесь НЕ просим: сначала слой проверяет готовность Vosk (нет модели — «Нужно скачать»), и только по тапу «Начать» на готовой модели уходит запрос микрофона (SayAloudOverlay).
// Датчик движения не нужен: игра вертикальная. Слой (Пит, дорожки, Vosk) грузится отдельным куском только по тапу — вкладка «Память» его не тянет.
const SayAloudOverlay = lazy(() => import('./SayAloudOverlay.jsx'))

export default function SayAloudLaunch({ view, withWord = null, variant = 'tab' }) {
  const [round, setRound] = useState(null) // null | { words }
  if (!canSayAloud(view, withWord)) return null

  function start() {
    const words = pickRoundWords(view, { min: MIN_TO_SHOW, withWord })
    if (words.length < MIN_TO_SHOW) return
    setRound({ words })
  }

  return (
    <>
      <button type="button" className={`sayLaunch sayLaunch--${variant}`} onClick={start} data-testid="say-aloud-launch">
        <Mic size={16} aria-hidden="true" />
        <span>Скажи вслух</span>
      </button>
      {round && (
        <Suspense fallback={null}>
          <SayAloudOverlay words={round.words} onClose={() => setRound(null)} />
        </Suspense>
      )}
    </>
  )
}
