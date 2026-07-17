import { useState } from 'react'
import { subscribePush } from '../../../../shared/lib/push.js'

// Попап после успешной регистрации в уроке: предложение включить уведомления.
// subscribePush вызывается ТОЛЬКО из обработчика тапа (требование iOS).
// z-index выше LessonSummary: если рег-нода последняя и урок завершается,
// попап остаётся поверх итогов, пока пользователь не ответит.
export default function PushPromptPopup({ onClose }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function handleEnable() {
    if (busy) return
    setErr('')
    setBusy(true)
    try {
      await subscribePush()
      onClose?.()
    } catch (e) {
      // denied/dismissed — пользователь отказал системному запросу, не ругаемся
      if (e.message === 'denied' || e.message === 'dismissed') { onClose?.(); return }
      setErr('Не получилось: ' + e.message)
      setBusy(false)
    }
  }

  return (
    <div className="pushPromptOverlay" onClick={() => { if (!busy) onClose?.() }}>
      <div className="pushPromptCard" onClick={e => e.stopPropagation()}>
        <div className="pushPromptIcon">🔔</div>
        <div className="pushPromptTitle">Включи уведомления</div>
        <div className="pushPromptText">
          Будем напоминать о занятиях и сообщать о наградах — без спама
        </div>
        {err && <div className="pushPromptErr">{err}</div>}
        <button className="pushPromptBtnPrimary" onClick={handleEnable} disabled={busy}>
          {busy ? 'Включаем...' : 'Разрешить уведомления'}
        </button>
        <button className="pushPromptBtnLater" onClick={() => onClose?.()} disabled={busy}>
          Не сейчас
        </button>
      </div>
    </div>
  )
}
