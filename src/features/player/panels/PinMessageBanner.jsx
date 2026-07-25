import { useState } from 'react'
import { X } from 'lucide-react'
import PinConfirmDialog from './PinConfirmDialog.jsx'
import HighlightedText from '../../../shared/ui/HighlightedText.jsx'

export default function PinMessageBanner({ content, highlights = [], onUnpin }) {
  const [confirm, setConfirm] = useState(false)
  if (!content) return null
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
