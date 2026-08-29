import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import PinConfirmDialog from './PinConfirmDialog.jsx'
import HighlightedText from '../../../shared/ui/HighlightedText.jsx'
import { MSG_SLIDE_MS } from '../PlayerFeed.jsx'

// Сначала в переписке появляется строка «закрепил сообщение» (она летит снизу
// MSG_SLIDE_MS), и только потом сверху выезжает сам закреп. Порядок важен:
// баннер — это следствие события в чате, а не одновременное с ним явление
const AFTER_ROW_MS = 200

export default function PinMessageBanner({ content, highlights = [], onUnpin }) {
  const [confirm, setConfirm] = useState(false)
  const [shown,   setShown]   = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShown(true), MSG_SLIDE_MS + AFTER_ROW_MS)
    return () => clearTimeout(t)
  }, [])
  if (!content || !shown) return null
  return (
    <>
      <div className="pinBanner">
        <span className="pinBannerText">
          <HighlightedText text={content} highlights={highlights} />
        </span>
        <button className="pinBannerClose" onClick={() => setConfirm(true)} aria-label="Открепить"><X size={14} /></button>
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
