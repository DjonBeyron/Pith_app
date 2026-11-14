import { useState, useEffect } from 'react'
import { listVoices } from '../../../shared/lib/ttsApi.js'
import { getAppSetting, saveAppSetting } from '../../../shared/api/appSettingsApi.js'
import { MIA_VOICE_KEY, setMiaVoice, isFreeVoice } from '../../pitrace/mia/miaVoice.js'

// «Выбрать голос Мии» (Админ → «Голос» → «Встряхни память» → «Озвучка Пита» → «Эпизод «Мия»»): список голосов ВТОРОГО аккаунта ElevenLabs прямо из аккаунта (ключ с правом Voices: Read),
// с примером звучания ▶ и пометкой, какие голоса бесплатные: на Free через API работают только стандартные (premade); библиотечные дают 402 paid_plan_required. «Взять» сохраняет
// голос в app_settings.race_mia_voice — им озвучиваются реплики Мии (главнее секрета ELEVENLABS_VOICE_ID_MIA). Зависимости подменяются в тестах (deps).
const play = url => { try { new Audio(url).play() } catch { /* нет звука — не страшно */ } }

export default function MiaVoicePicker({ deps = {} }) {
  const d = { list: listVoices, get: getAppSetting, save: saveAppSetting, ...deps }
  const [cur, setCur] = useState(null)
  const [voices, setVoices] = useState(null)
  const [paid, setPaid] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {  // читаем сохранённый голос один раз
    let live = true
    Promise.resolve(d.get(MIA_VOICE_KEY)).then(v => { if (live && v?.voiceId) { setCur(v); setMiaVoice(v) } }).catch(() => {})
    return () => { live = false }
  }, [])
  const load = () => { setStatus('загружаю голоса…'); Promise.resolve(d.list('mia')).then(v => { setVoices(v); setStatus(`голосов в аккаунте: ${v.length}`) }, e => setStatus(`не получилось: ${e?.message ?? e}`)) }
  const take = async v => {
    const val = { voiceId: v.id, name: v.name }
    try { await d.save(MIA_VOICE_KEY, val); setMiaVoice(val); setCur(val); setStatus(`выбран голос «${v.name}» — теперь «Озвучить Мию»`) } catch (e) { setStatus(`не сохранилось: ${e?.message ?? e}`) }
  }
  const shown = (voices ?? []).filter(v => paid || isFreeVoice(v))
  return (
    <div className="rvMiaVoice" data-testid="mia-voice">
      <div className="rvTop">
        <span data-testid="mia-voice-cur">Голос Мии: {cur ? `«${cur.name || cur.voiceId}»` : 'из секрета ELEVENLABS_VOICE_ID_MIA'}</span>
        <button type="button" className="aspChip" onClick={load} data-testid="mia-voice-load">{voices ? 'Обновить список голосов' : 'Выбрать голос Мии'}</button>
        {voices && <label className="rhpHint"><input type="checkbox" checked={paid} onChange={e => setPaid(e.target.checked)} /> показать и платные (не для Free)</label>}
      </div>
      {status && <p className="rhpHint" role="status" data-testid="mia-voice-status">{status}</p>}
      {!voices && <p className="rhpHint">Нужен ключ второго аккаунта с правом «Voices: Read». Бесплатные голоса — стандартные (premade).</p>}
      {voices && !shown.length && <p className="rhpHint" data-testid="mia-voice-empty">Бесплатных (premade) голосов в аккаунте нет — отметь «показать и платные» или проверь, что у ключа включён «Voices: Read».</p>}
      <ul className="rvList" data-testid="mia-voice-list">
        {shown.map(v => (
          <li key={v.id} className="rvRow" data-testid={`mia-voice-${v.id}`}>
            <div className="rvHead"><b>{v.name}</b><span className="rvDur">{[v.gender, v.accent, v.age].filter(Boolean).join(' · ')}</span><span className={`rvStatus ${isFreeVoice(v) ? 'rvStatus-ok' : 'rvStatus-none'}`}>{isFreeVoice(v) ? 'бесплатный (premade)' : `платный · ${v.category || '?'}`}</span></div>
            {(v.description || v.useCase) && <div className="rvLabel">{[v.description, v.useCase].filter(Boolean).join(' · ')}</div>}
            <div className="rvEdit">
              {v.preview && <button type="button" className="aspChip" onClick={() => play(v.preview)} aria-label={`Пример голоса ${v.name}`}>▶ пример</button>}
              <button type="button" className="aspChip" onClick={() => take(v)} disabled={cur?.voiceId === v.id} data-testid="mia-voice-take">{cur?.voiceId === v.id ? 'выбран' : 'Взять'}</button>
              <code className="rvId">{v.id}</code>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
