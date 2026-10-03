import { useState, useEffect } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { hintSeen, markHint } from './reviewHints.js'

// «Не могу слушать» — на карточке со звуком или голосом, в нижней панели, справа. Первый раз — кнопка
// с подписью; через пару секунд она «сдувается»: прямоугольник плавно превращается в кружок с иконкой,
// и так остаётся навсегда (флаг COMPACT). Не исчезает: когда ответ дан и появилась подсказка «смахни…»,
// disabled — кнопка тускнеет и не нажимается. Нажимаемая зона больше самой кнопки (отступы слота).
// Первое нажатие показывает попап: что делает кнопка, без нажима (флаг INFO — один раз); дальше
// нажатие срабатывает сразу.
// onSkip — до конца сессии голосовые беззвучны, задания, где без звука никак, уходят
// (useReviewSession.skipAudio); disabled — ответ уже дан.
// Это тумблер, как значок звука в ленте: звук есть — значок динамика (Volume2); нажали — кнопка серая,
// динамик зачёркнут (VolumeX), и она остаётся на месте: нажми ещё раз (onUnmute) — звук вернётся.
const COMPACT = 'pithy_review_noaudio_compact_v1'
const INFO = 'pithy_review_noaudio_info_v1'
const COLLAPSE_MS = 3500

export default function NoAudioButton({ onSkip, onUnmute = null, muted = false, disabled = false }) {
  const [compact, setCompact] = useState(() => hintSeen(COMPACT))
  const [ask, setAsk] = useState(false)

  useEffect(() => {
    if (compact) return
    const t = setTimeout(() => { markHint(COMPACT); setCompact(true) }, COLLAPSE_MS)
    return () => clearTimeout(t)
  }, [compact])

  function press() {
    if (muted) { onUnmute?.(); return }
    if (disabled) return
    if (hintSeen(INFO)) { onSkip(); return }
    markHint(INFO)
    setAsk(true)
  }

  return (
    <>
      <span className="reviewNoAudioSlot">
        <button
          className={`reviewNoAudio${compact ? ' reviewNoAudio--compact' : ''}${muted ? ' reviewNoAudio--off' : ''}`}
          onClick={press} disabled={disabled && !muted} aria-pressed={muted}
          aria-label={muted ? 'Включить звук' : 'Не могу слушать'} title={muted ? 'Включить звук' : 'Не могу слушать'}>
          {muted ? <VolumeX className="reviewNoAudioIcon" /> : <Volume2 className="reviewNoAudioIcon" />}
          <span className="reviewNoAudioLabel">{muted ? 'Звук выключен' : 'Не могу слушать'}</span>
        </button>
      </span>
      {ask && (
        <div className="reviewPopBack" onClick={() => setAsk(false)}>
          <div className="reviewPop" role="dialog" aria-label="Не могу слушать" onClick={e => e.stopPropagation()}>
            <p className="reviewPopTitle">Не можешь послушать?</p>
            <p className="reviewPopText">
              Ничего страшного: бывает, что рядом шумно или нет наушников. Голосовые станут беззвучными — текст в них
              останется. Задания, где без звука никак, мы уберём, а эти слова вернутся к тебе в другой раз.
            </p>
            <button className="lrBtn lrBtnMain" onClick={() => { setAsk(false); onSkip() }}>Выключить звук</button>
            <button className="lrBtn lrBtnGhost" onClick={() => setAsk(false)}>Оставить</button>
          </div>
        </div>
      )}
    </>
  )
}
