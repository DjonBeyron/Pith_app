import { useState } from 'react'
import AdminToggleRow from './AdminToggleRow.jsx'
import { useAudioStaticWaveform, setAudioStaticWaveform } from '../../shared/lib/useAudioStaticWaveform.js'

// Заморозка спектра голосовых — ГЛОБАЛЬНО, для всех голосовых во всех
// уроках сразу. Включено: каждый бар спектра встаёт на высоту самой
// громкой амплитуды всей записи (посчитанной один раз, как только готовы
// данные волны) и больше не двигается — ни во время игры, ни на паузе, ни
// после конца воспроизведения (см. AudioModule.jsx).
//
// Настройка общая, лежит в базе (app_settings.audio_static_waveform). Пока
// сервер не подтвердил запись, тумблер заблокирован — та же причина, что
// у AdminDebugUiToggle.jsx.
export default function AdminAudioWaveformToggle() {
  const on = useAudioStaticWaveform()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function handleChange(next) {
    setSaving(true)
    setError('')
    try {
      await setAudioStaticWaveform(next)
    } catch (e) {
      setError(e?.message || 'Не удалось сохранить')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AdminToggleRow
      title="Заморозка спектра голосовых"
      on={on}
      disabled={saving}
      onChange={handleChange}
      hint={error || 'Спектр живой: бары колеблются под звук во время игры.'}
      hintOn={error || 'Спектр застыл на пике громкости — во всех уроках, всегда.'}
    />
  )
}
