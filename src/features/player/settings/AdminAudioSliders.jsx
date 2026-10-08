import { useEffect } from 'react'
import { useAdmin } from '../../../app/AdminContext.jsx'
import { preloadSounds, unlockAudio, volumeUnsupported } from '../../../shared/lib/sounds.js'
import { EQ_MIN, EQ_MAX } from '../../../shared/lib/audioSettings.js'
import AudioSliderRow from './AudioSliderRow.jsx'
import { useAudioSettings } from './useAudioSettings.js'
import { playEqPreview, stopEqPreview } from './eqPreview.js'
import { previewSound, cancelSoundPreview } from './soundPreview.js'

// Админский блок меню-шестерёнки: громкость звуков интерфейса и чувствительность
// эквалайзера — ГЛОБАЛЬНО для всех пользователей (app_settings, см.
// audioSettings.js). Ползунок применяется сразу локально и проигрывает звук с
// выбранной громкостью (не чаще 250 мс, soundPreview.js); в базу уходит через 600 мс после
// последнего изменения. Не-админу — ничего
const SOUNDS = [
  ['message-in', 'Сообщение учителя'],
  ['answer-correct', 'Верный ответ'],
  ['answer-wrong', 'Неверный ответ'],
  ['pin-message', 'Закреп'],
  ['typing-1', 'Печатает 1'],
  ['typing-2', 'Печатает 2'],
  ['xp-gain', 'Начисление XP'],
  ['level-up', 'Новый уровень'],
  ['lesson-locked', 'Закрытый урок'],
]
const STATUS_TEXT = { dirty: 'изменено…', saving: 'сохраняю…', saved: 'сохранено для всех', error: 'ошибка сохранения' }

// Ползунок — жест: на iOS звук надо разблокировать прямо в нём
function unlock() { preloadSounds(); unlockAudio() }

export default function AdminAudioSliders() {
  const { isAdmin } = useAdmin()
  if (!isAdmin) return null
  return <Sliders />
}

function Sliders() {
  const { volumes, eq, status, error, setVolume, resetVolumes, setEq } = useAudioSettings()
  useEffect(() => () => { cancelSoundPreview(); stopEqPreview() }, [])

  return (
    <div className="asBlock">
      <div className="asTitle">Громкость звуков интерфейса (для всех)</div>
      {volumeUnsupported() && (
        <div className="asNote">На этом устройстве громкость не регулируется (iOS без Audio Session API)</div>
      )}
      {SOUNDS.map(([name, label]) => {
        const pct = Math.round((volumes[name] ?? 1) * 100)
        return (
          <AudioSliderRow
            key={name}
            label={label}
            value={pct}
            min={0}
            max={100}
            step={5}
            display={`${pct} %`}
            onPointerDown={unlock}
            onChange={p => { unlock(); setVolume(name, p / 100); previewSound(name) }}
          />
        )
      })}
      <div className="asFoot">
        <button type="button" className="asReset" onClick={resetVolumes}>Сбросить всё</button>
        <span className={`asStatus asStatus--${status}`} role="status" title={status === 'error' ? error : undefined}>
          {STATUS_TEXT[status] ?? ''}{status === 'error' && error ? `: ${error}` : ''}
        </span>
      </div>
      <div className="asTitle asTitle--eq">Чувствительность эквалайзера (для всех)</div>
      <AudioSliderRow
        label="Чувствительность"
        value={eq}
        min={EQ_MIN}
        max={EQ_MAX}
        step={0.1}
        display={`${eq.toFixed(1)}×`}
        onChange={v => { setEq(v); playEqPreview() }}
      />
    </div>
  )
}
