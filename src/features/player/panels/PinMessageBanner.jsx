import { useState } from 'react'
import PinConfirmDialog from './PinConfirmDialog.jsx'

export default function PinMessageBanner({ content, onUnpin }) {
  const [confirm, setConfirm] = useState(false)
  if (!content) return null
  return (
    <>
      <div className="pinBanner">
        <span className="pinBannerText">{content}</span>
        <button className="pinBannerClose" onClick={() => setConfirm(true)} aria-label="Открепить">✕</button>
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
