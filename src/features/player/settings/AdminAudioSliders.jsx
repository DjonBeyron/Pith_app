import { useEffect } from 'react'
import { useAdmin } from '../../../app/AdminContext.jsx'
import { preloadSounds, unlockAudio, volumeUnsupported, canBoostPlay } from '../../../shared/lib/sounds.js'
import { EQ_MIN, EQ_MAX } from '../../../shared/lib/audioSettings.js'
import AudioSliderRow from './AudioSliderRow.jsx'
import { useAudioSettings } from './useAudioSettings.js'
import { playEqPreview, stopEqPreview } from './eqPreview.js'
import { previewSound, cancelSoundPreview } from './soundPreview.js'

// Админский блок меню-шестерёнки: громкость звуков интерфейса и чувствительность
// эквалайзера — ГЛОБАЛЬНО для всех пользователей (app_settings, см.
// audioSettings.js). Ползунок применяется сразу локально и проигрывает звук с
// выбранной громкостью (не чаще 250 мс, soundPreview.js); в базу уходит через 600 мс после
// последнего изменения. Не-админу — ничего.
//
// names — какие звуки двигает ползунок (первый играет в превью и показывает
// значение). «Звук печатанья» — один ползунок на typing-1 и typing-2: для
// ученика это один звук (второй — он же тише, при затянувшемся ожидании файлов),
// в базе остаются оба ключа с одним значением. boost — ползунок до 200 %: эти
// файлы записаны тихо, и без усиления их не слышно ни на 100 %; усиление идёт через
// Web Audio (на iPhone без Audio Session API его нет — ползунок остаётся до 100 %)
const SOUNDS = [
  { names: ['message-in'], label: 'Сообщение учителя' },
  { names: ['answer-correct'], label: 'Верный ответ' },
  { names: ['answer-wrong'], label: 'Неверный ответ' },
  { names: ['pin-message'], label: 'Закреп' },
  { names: ['typing-1', 'typing-2'], label: 'Звук печатанья', boost: true },
  { names: ['xp-gain'], label: 'Начисление XP', boost: true },
  { names: ['level-up'], label: 'Новый уровень' },
  { names: ['lesson-locked'], label: 'Закрытый урок' },
]
const BOOST_MAX_PCT = 200
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
      {SOUNDS.map(({ names, label, boost }) => {
        const name = names[0]
        const canBoost = !!boost && canBoostPlay()
        const max = canBoost ? BOOST_MAX_PCT : 100
        const pct = Math.round((volumes[name] ?? 1) * 100)
        return (
          <AudioSliderRow
            key={name}
            label={label}
            value={Math.min(pct, max)}
            min={0}
            max={max}
            step={5}
            display={`${pct} %`}
            hint={boost && !canBoost ? 'усиление недоступно на этом устройстве' : null}
            onPointerDown={unlock}
            onChange={p => { unlock(); setVolume(names, p / 100); previewSound(name) }}
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
