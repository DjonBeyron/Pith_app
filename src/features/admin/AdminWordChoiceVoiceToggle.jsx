import { useState } from 'react'
import AdminToggleRow from './AdminToggleRow.jsx'
import { wordChoiceVoice } from '../../shared/lib/wordChoiceVoice.js'

// Озвучка верного ответа в «Выбери слово» — глобально (см. wordChoiceVoice.js).
// По умолчанию выключено. Тот же вид и та же дисциплина, что у
// AdminAudioWaveformToggle.jsx: тумблер заблокирован, пока сервер не подтвердил
export default function AdminWordChoiceVoiceToggle() {
  const on = wordChoiceVoice.use()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleChange(next) {
    setSaving(true)
    setError('')
    try { await wordChoiceVoice.set(next) }
    catch (e) { setError(e?.message || 'Не удалось сохранить') }
    finally { setSaving(false) }
  }

  return (
    <AdminToggleRow
      title="Озвучка слова в «Выбери слово»"
      on={on}
      disabled={saving}
      onChange={handleChange}
      hint={error || 'Выключено: верный ответ в «Выбери слово» не озвучивается (остальные модули озвучивают всегда).'}
      hintOn={error || 'Верный ответ в «Выбери слово» произносится — во всех уроках.'}
    />
  )
}
