import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { VOICE_PRESETS, CUSTOM_VOICE, presetOf, voiceName, TRANSLATION_PREVIEW_PHRASE, charCost, TRANSLATION_VOICE_HINT, SUGGESTED_TRANSLATION_VOICE } from './voicePresets.js'
import { translationVoiceSpec, DEFAULT_VOICE_ID } from '../../../scene/v2/sceneVoice.js'
import ScTip from '../ScTip.jsx'

// Голос ПЕРЕВОДА (диктор между репликами). Два места: у персонажа (who='a'|'b', value —
// voice.translationVoiceId, пусто = «как у сцены») и общий для сцены (who=null, value —
// options.translationVoiceId, пусто = «голос проекта»). Разрешение — translationVoiceSpec:
// персонаж → сцена → 'default'. «Прослушать голос перевода» — короткая русская фраза, файл не
// сохраняется (стоимость в символах рядом). voice — API useSceneVoice (null — без прослушки).
const INHERIT = ''

export default function TranslationVoicePicker({ who = null, value, onChange, scene = null, character = null, voice = null, idPrefix }) {
  const cur = typeof value === 'string' ? value.trim() : ''
  const [custom, setCustom] = useState(() => !!cur && !presetOf(cur))
  const sel = custom ? CUSTOM_VOICE : (cur ? (presetOf(cur) ? cur : CUSTOM_VOICE) : INHERIT)
  const [err, setErr] = useState('')
  const key = who ? `tr-${who}` : 'tr-scene'
  const busy = voice?.previewBusy === key
  const playing = voice?.playing === `voice-${key}`
  const resolved = translationVoiceSpec(character, scene).voiceId
  const inheritLabel = who ? `Как у сцены (${voiceName(scene?.options?.translationVoiceId ?? DEFAULT_VOICE_ID)})` : 'Голос проекта (секрет ELEVENLABS_VOICE_ID)'

  const pick = v => {
    if (v === CUSTOM_VOICE) { setCustom(true); return }
    setCustom(false)
    onChange(v)
  }
  const listen = async () => {
    setErr('')
    const e = await voice.previewVoice(who, 'translation')
    if (e) setErr(e)
  }

  return (
    <div className="scbVoiceEl scbVoiceTr">
      <span className="scbCtlGroup"><span className="scLabel">Голос перевода</span> <ScTip help="translation_voice" /></span>
      <label className="scbField">
        <span className="scbFieldLabel">{who ? 'Голос перевода у персонажа' : 'Общий голос перевода сцены'}</span>
        <select id={idPrefix} className="fsNote" value={sel} onChange={e => pick(e.target.value)}>
          <option value={INHERIT}>{inheritLabel}</option>
          {VOICE_PRESETS.filter(o => o.id !== DEFAULT_VOICE_ID).map(o => (
            <option key={o.id} value={o.id}>{o.name}{o.gender ? (o.gender === 'male' ? ' ♂' : ' ♀') : ''} — {o.note}{o.id === SUGGESTED_TRANSLATION_VOICE ? ' · подходит диктору' : ''}</option>
          ))}
          <option value={CUSTOM_VOICE}>Свой voiceId…</option>
        </select>
      </label>
      {sel === CUSTOM_VOICE && (
        <label className="scbField">
          <span className="scbFieldLabel">voiceId из кабинета ElevenLabs</span>
          <input className="fsNote scbMono" value={cur} placeholder="например yoZ06aMxZJJ28mfd3POQ" onChange={e => onChange(e.target.value)} spellCheck={false} />
        </label>
      )}
      <p className="scbSub">
        {who ? 'Если пусто — общий голос сцены, затем голос проекта.' : 'Если у персонажа свой голос перевода не задан — этот; пусто — голос проекта.'}
        {' '}Сейчас читает: <b>{voiceName(resolved)}</b>. {TRANSLATION_VOICE_HINT}
      </p>
      {voice && (
        <div className="scbVoiceListen">
          <button type="button" className="fsBtn fsBtnSmall" onClick={listen} disabled={!!voice.busy} title={`Фраза: «${TRANSLATION_PREVIEW_PHRASE}»`}>
            <Volume2 size={13} /> {busy ? 'Генерирую…' : playing ? 'Играет…' : 'Прослушать голос перевода'}
          </button>
          <span className="scbSub">≈ {charCost(TRANSLATION_PREVIEW_PHRASE)} симв. квоты, файл не сохраняется</span>
          {err && <span className="scbVoiceErr" role="alert">{err}</span>}
        </div>
      )}
    </div>
  )
}
