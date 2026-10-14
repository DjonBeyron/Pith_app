import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { VOICE_PRESETS, CUSTOM_VOICE, selectValue, presetOf, VOICE_SLIDERS, sliderValue, PREVIEW_PHRASE, charCost, defaultVoiceFor } from './voicePresets.js'
import { DEFAULT_VOICE_ID } from '../../../scene/v2/sceneVoice.js'
import ScTip from '../ScTip.jsx'

// Голос ElevenLabs персонажа в CharacterForm: выпадающий список пресетов (с полом и
// характером), поле своего voiceId, ползунки stability/similarity/speed и «Прослушать
// голос» (тестовая фраза, стоимость в символах квоты). Подсказка, если пол голоса не
// совпадает с полом кота. voice — API useSceneVoice (null — без кнопки прослушать).
export default function VoicePicker({ who, character, actions, voice = null }) {
  const p = `f-characters-${who}-voice`
  const v = character.voice ?? {}
  // «Свой voiceId…» с пустым полем: builderModel.setVoice удаляет пустой voiceId, поэтому режим держим локально
  const [custom, setCustom] = useState(false)
  const sel = custom ? CUSTOM_VOICE : selectValue(v.voiceId)
  const preset = presetOf(v.voiceId)
  const [err, setErr] = useState('')
  const mismatch = !custom && preset?.gender && preset.gender !== character.gender
  const busy = voice?.previewBusy === who
  const playing = voice?.playing === `voice-${who}`

  const pick = id => {
    if (id === CUSTOM_VOICE) { setCustom(true); return }
    setCustom(false)
    actions.setVoice(who, { voiceId: id === DEFAULT_VOICE_ID ? '' : id })
  }
  const listen = async () => {
    setErr('')
    const e = await voice.previewVoice(who)
    if (e) setErr(e)
  }

  return (
    <div className="scbVoiceEl">
      <span className="scbCtlGroup"><span className="scLabel">Голос ElevenLabs</span> <ScTip help="voice_id" /></span>
      <label className="scbField">
        <span className="scbFieldLabel">Голос</span>
        <select id={`${p}-voiceId`} className="fsNote" value={sel} onChange={e => pick(e.target.value)}>
          {VOICE_PRESETS.map(o => (
            <option key={o.id} value={o.id}>{o.name}{o.gender ? (o.gender === 'male' ? ' ♂' : ' ♀') : ''} — {o.note}</option>
          ))}
          <option value={CUSTOM_VOICE}>Свой voiceId…</option>
        </select>
      </label>
      {sel === CUSTOM_VOICE && (
        <label className="scbField">
          <span className="scbFieldLabel">voiceId из кабинета ElevenLabs</span>
          <input className="fsNote scbMono" value={v.voiceId ?? ''} placeholder="например pNInz6obpgDQGcFmaJgB" onChange={e => actions.setVoice(who, { voiceId: e.target.value })} spellCheck={false} />
        </label>
      )}
      {mismatch && (
        <p className="scbSlotReason" role="status">
          Голос {preset.gender === 'male' ? 'мужской' : 'женский'}, а персонаж — {character.gender === 'male' ? 'кот' : 'кошка'}.{' '}
          <button type="button" className="scbLink" onClick={() => pick(defaultVoiceFor(character.gender))}>Подобрать по полу</button>
        </p>
      )}
      {VOICE_SLIDERS.map(s => (
        <label key={s.key} className="scbRange" title={s.hint}>
          <span>{s.label} {sliderValue(v, s.key).toFixed(2)}</span>
          <input id={`${p}-${s.key}`} type="range" min={s.range[0]} max={s.range[1]} step={s.step} value={sliderValue(v, s.key)} onChange={e => actions.setVoice(who, { [s.key]: Number(e.target.value) })} aria-label={`${s.label} голоса`} />
        </label>
      ))}
      {voice && (
        <div className="scbVoiceListen">
          <button type="button" className="fsBtn fsBtnSmall" onClick={listen} disabled={!!voice.busy} title={`Фраза: «${PREVIEW_PHRASE}»`}>
            <Volume2 size={13} /> {busy ? 'Генерирую…' : playing ? 'Играет…' : 'Прослушать голос'}
          </button>
          <span className="scbSub">≈ {charCost(PREVIEW_PHRASE)} симв. квоты, файл не сохраняется</span>
          {err && <span className="scbVoiceErr" role="alert">{err}</span>}
        </div>
      )}
    </div>
  )
}
