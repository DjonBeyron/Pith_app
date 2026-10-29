import { useState } from 'react'
import { getRewardSound, setRewardSound, getRewardVolume, setRewardVolume } from '../../player/modules/rotate-phone/wordLaneMeow.js'
import { previewReward } from '../../player/modules/rotate-phone/wordLaneNotes.js'

// Админ → «Голос»: «Звуки игры» — что звучит за принятые пилюли в «Повтори за диктором» (три тона лесенки). «Мяу» (по умолчанию) / «Ноты» (прежние до-ми-соль) / «Без звука» —
// localStorage `pithy_game_reward_sound_v1`; громкость 0…1 — `pithy_game_reward_volume_v1` (audio.volume, на iOS не работает: там тише сами файлы мяу). «Послушать» играет из тапа выбранным вариантом.
const MODES = [['meow', 'Мяу'], ['notes', 'Ноты'], ['off', 'Без звука']]
const TONES = ['Тон 1 (низкий)', 'Тон 2 (выше)', 'Тон 3 (финал)']

export default function GameSoundsBlock() {
  const [mode, setMode] = useState(getRewardSound)
  const [volume, setVolume] = useState(getRewardVolume)
  const pick = m => { setRewardSound(m); setMode(getRewardSound()) }
  const slide = v => { setRewardVolume(v); setVolume(getRewardVolume()) }
  return (
    <section className="aspBlock" data-testid="game-sounds-block">
      <h3 className="aspH">Звуки игры «Повтори за диктором»</h3>
      <div className="aspChips" role="group" aria-label="Звук награды">
        {MODES.map(([id, label]) => (
          <button key={id} type="button" className={`aspChip${mode === id ? ' aspChipOn' : ''}`} aria-pressed={mode === id} data-testid={`reward-sound-${id}`} onClick={() => pick(id)}>{label}</button>
        ))}
      </div>
      <label className="aspLabel">Громкость: {Math.round(volume * 100)} %
        <input type="range" min="0" max="1" step="0.05" value={volume} aria-label="Громкость звука награды" data-testid="reward-volume" onChange={e => slide(e.target.value)} />
      </label>
      <div className="aspRow">
        {TONES.map((label, k) => (
          <button key={label} type="button" className="aspChip" disabled={mode === 'off'} data-testid={`reward-listen-${k + 1}`} onClick={() => previewReward(k)}>Послушать: {label}</button>
        ))}
      </div>
      <p className="aspHint">За каждую принятую пилюлю звучит следующий тон: до — ми — финал (чуть длиннее). «Мяу» — по умолчанию, файлы заметно тише прежних нот. Громкость работает на Android и компьютере; на iPhone Safari не даёт менять громкость сайта, поэтому там ползунок ничего не меняет — только тише сами файлы мяу (если нужно ещё тише, выбери «Без звука»). Действует со следующего тапа «Начать» в игре.</p>
    </section>
  )
}
