import { useState, useEffect } from 'react'
import { VolumeX } from 'lucide-react'
import { hintSeen, markHint } from './reviewHints.js'

// «Не могу слушать» — на карточке со звуком или голосом, в нижней панели, справа и вдвое мельче
// прежнего. Первый раз — кнопка с подписью; через пару секунд она «сдувается»:
// прямоугольник плавно превращается в кружок с иконкой, и так остаётся навсегда
// (флаг COMPACT). Не исчезает: когда ответ дан и появилась подсказка «смахни…», disabled —
// кнопка тускнеет и не нажимается. Нажимаемая зона больше самой кнопки (отступы слота). Первое нажатие показывает попап: что делает кнопка, без
// нажима (флаг INFO — один раз); дальше нажатие срабатывает сразу.
// onSkip — убрать задания со звуком до конца сессии; disabled — ответ уже дан.
const COMPACT = 'pithy_review_noaudio_compact_v1'
const INFO = 'pithy_review_noaudio_info_v1'
const COLLAPSE_MS = 3500

export default function NoAudioButton({ onSkip, disabled = false }) {
  const [compact, setCompact] = useState(() => hintSeen(COMPACT))
  const [ask, setAsk] = useState(false)

  useEffect(() => {
    if (compact) return
    const t = setTimeout(() => { markHint(COMPACT); setCompact(true) }, COLLAPSE_MS)
    return () => clearTimeout(t)
  }, [compact])

  function press() {
    if (disabled) return
    if (hintSeen(INFO)) { onSkip(); return }
    markHint(INFO)
    setAsk(true)
  }

  return (
    <>
      <span className="reviewNoAudioSlot">
        <button className={compact ? 'reviewNoAudio reviewNoAudio--compact' : 'reviewNoAudio'} onClick={press} disabled={disabled}
          aria-label="Не могу слушать" title="Не могу слушать">
          <VolumeX className="reviewNoAudioIcon" />
          <span className="reviewNoAudioLabel">Не могу слушать</span>
        </button>
      </span>
      {ask && (
        <div className="reviewPopBack" onClick={() => setAsk(false)}>
          <div className="reviewPop" role="dialog" aria-label="Не могу слушать" onClick={e => e.stopPropagation()}>
            <p className="reviewPopTitle">Не можешь послушать?</p>
            <p className="reviewPopText">
              Ничего страшного: бывает, что рядом шумно или нет наушников. Мы уберём задания со звуком и голосом, а слова вернутся к тебе в другой раз.
            </p>
            <button className="lrBtn lrBtnMain" onClick={() => { setAsk(false); onSkip() }}>Убрать задания со звуком</button>
            <button className="lrBtn lrBtnGhost" onClick={() => setAsk(false)}>Оставить</button>
          </div>
        </div>
      )}
    </>
  )
}
