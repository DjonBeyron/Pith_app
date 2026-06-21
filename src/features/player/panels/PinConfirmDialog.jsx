import { useEffect } from 'react'

export default function PinConfirmDialog({ onConfirm, onCancel }) {
  // Close on backdrop click
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onCancel()
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="pinDialog" onClick={handleBackdrop}>
      <div className="pinDialogCard">
        <p className="pinDialogTitle">Открепить сообщение?</p>
        <p className="pinDialogSub">Сообщение останется в чате</p>
        <div className="pinDialogActions">
          <button className="pinDialogBtn pinDialogBtn--cancel" onClick={onCancel}>
            Отмена
          </button>
          <button className="pinDialogBtn pinDialogBtn--confirm" onClick={onConfirm}>
            Открепить
          </button>
        </div>
      </div>
    </div>
  )
}
