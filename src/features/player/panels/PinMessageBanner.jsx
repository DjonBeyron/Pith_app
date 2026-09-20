import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import PinConfirmDialog from './PinConfirmDialog.jsx'
import HighlightedText from '../../../shared/ui/HighlightedText.jsx'
import { MSG_SLIDE_MS } from '../PlayerFeed.jsx'

// Сначала в переписке появляется строка «закрепил сообщение» (она летит снизу
// MSG_SLIDE_MS), и только потом сверху выезжает сам закреп. Порядок важен:
// баннер — это следствие события в чате, а не одновременное с ним явление
const AFTER_ROW_MS = 200
// Растворение накладки «Напомнить правило» (та же длительность в CSS)
const COVER_FADE_MS = 300

// Пока открыта «ручная» панель сборки (table-manual/«Собери фразу»/«Составь
// предложение», см. LessonPlayer.jsx), закреп выше по ленте отвлекает —
// поэтому на это время он блюрится и накрывается тусклой подсказкой. Тап по
// ней снимает блюр СРАЗУ (не по таймеру); повторный тап по уже открытому
// закрепу (пока панель всё ещё открыта) блюрит его обратно — переключатель
// в обе стороны, а не разовое открытие. При закрытии панели manualPanelOpen
// сам возвращается в false, и тогда сброс дисмисса готовит блюр к следующему разу.
export default function PinMessageBanner({ content, highlights = [], onUnpin, manualPanelOpen = false }) {
  const [confirm, setConfirm] = useState(false)
  const [shown,   setShown]   = useState(false)
  const [coverDismissed, setCoverDismissed] = useState(false)
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), MSG_SLIDE_MS + AFTER_ROW_MS)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    if (wasOpenRef.current && !manualPanelOpen) setCoverDismissed(false)
    wasOpenRef.current = manualPanelOpen
  }, [manualPanelOpen])
  const covered = manualPanelOpen && !coverDismissed
  // Накладка уходит не рывком, а растворяется: после снятия (тап или
  // закрытие панели) остаётся смонтированной на COVER_FADE_MS с классом
  // --leaving, текст под ней уже виден
  const [leaving, setLeaving] = useState(false)
  const wasCoveredRef = useRef(false)
  useEffect(() => {
    if (wasCoveredRef.current && !covered) {
      setLeaving(true)
      const t = setTimeout(() => setLeaving(false), COVER_FADE_MS)
      wasCoveredRef.current = covered
      return () => clearTimeout(t)
    }
    wasCoveredRef.current = covered
  }, [covered])
  if (!content || !shown) return null
  return (
    <>
      <div className="pinBanner">
        <div
          className={`pinBannerInner${covered ? ' pinBannerInnerCovered' : ''}`}
          onClick={manualPanelOpen && !covered ? () => setCoverDismissed(false) : undefined}
          style={manualPanelOpen && !covered ? { cursor: 'pointer' } : undefined}
        >
          <span className="pinBannerText">
            <HighlightedText text={content} highlights={highlights} />
          </span>
          <button
            className="pinBannerClose"
            onClick={e => { e.stopPropagation(); setConfirm(true) }}
            aria-label="Открепить"
          ><X size={14} /></button>
        </div>
        {(covered || leaving) && (
          <button
            type="button"
            className={covered ? 'pinBannerCover' : 'pinBannerCover pinBannerCover--leaving'}
            onClick={covered ? () => setCoverDismissed(true) : undefined}
          >
            Напомнить правило
          </button>
        )}
      </div>
      {confirm && (
        <PinConfirmDialog
          onConfirm={() => { setConfirm(false); onUnpin?.() }}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  )
}
