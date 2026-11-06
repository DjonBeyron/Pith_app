import { useState, useEffect, useMemo, useCallback } from 'react'
import { getAppSetting, saveAppSetting } from '../../../shared/api/appSettingsApi.js'
import { transKey } from '../../pitrace/raceTrans.js'
import { RACE_PHRASE_RU_KEY, MEANING_HINT, meaningMap, meaningRows, mergeMeanings, isDirty, meaningTexts } from './racePhraseMeaning.js'
import useTransVoice from './useTransVoice.js'

// Админ → «Голос» → «Встряхни память (стенд)» → «Смысл фразы» (этап 2 «Фразы», CONCEPT_RACE.md): у каждой фразы плана — русское НАМЕРЕНИЕ («скажи, что рад знакомству»), которое Пит говорит в круге «Пойми».
// Сохранение — по кнопке «Сохранить» в app_settings.race_phrase_ru ({ [key]: text }); озвучка — та же, что у переводов слов (useTransVoice: ElevenLabs → R2 → word_audio, ключ transKey(смысл)),
// в игре Пит говорит смысл через sayText(ru, { ru: true }). Фраза без целой озвучки (audio === null) помечена «читается по словам».
const loadMeanings = () => getAppSetting(RACE_PHRASE_RU_KEY)
const saveMeanings = value => saveAppSetting(RACE_PHRASE_RU_KEY, value)

export default function RacePhraseMeaning({ plan, locked = false, load = loadMeanings, save = saveMeanings }) {
  const [saved, setSaved] = useState({})
  const [drafts, setDrafts] = useState({})
  const [state, setState] = useState({ busy: false, error: '', note: '' })
  useEffect(() => {
    let live = true
    Promise.resolve(load()).then(v => { if (live) setSaved(meaningMap(v)) }).catch(() => {})
    return () => { live = false }
  }, [load])
  const rows = useMemo(() => meaningRows(plan, saved), [plan, saved])
  const texts = useCallback(() => meaningTexts(rows), [rows])
  const voice = useTransVoice({ plan, texts })
  const voiced = new Set(voice.rows.filter(r => r.has).map(r => r.key))
  const dirty = isDirty(saved, drafts)
  const allVoiced = voice.done >= voice.total

  async function onSave() {
    setState({ busy: true, error: '', note: '' })
    try {
      const next = mergeMeanings(saved, drafts)
      await save(next)
      setSaved(next); setDrafts({})
      setState({ busy: false, error: '', note: 'Смыслы сохранены' })
    } catch (e) { setState({ busy: false, error: e?.message || String(e), note: '' }) }
  }

  return (
    <div className="rhpVoice" data-testid="race-meaning">
      <h4 className="aspH">Смысл фразы (этап 2)</h4>
      {!rows.length && <p className="rhpHint" data-testid="race-meaning-empty">В плане нет фраз</p>}
      {rows.map(r => {
        const value = drafts[r.key] ?? r.ru
        const has = !!r.ru && voiced.has(transKey(r.ru))
        return (
          <label key={r.key} className="aspLabel" data-testid={`race-meaning-${r.key}`}>
            <span>{r.text}{r.byWords && <span className="rhpHint" data-testid="race-meaning-bywords"> · читается по словам</span>}{r.ru && <span className="rhpHint"> · {has ? 'озвучено' : 'не озвучено'}</span>}</span>
            <input className="aspInput" type="text" value={value} placeholder={`Смысл по-русски (намерение, не перевод): «${MEANING_HINT}»`} disabled={locked || state.busy}
              onChange={e => { const v = e.target.value; setDrafts(d => ({ ...d, [r.key]: v })) }} />
          </label>
        )
      })}
      <div className="rhpVoiceRow">
        <button type="button" className="aspChip" onClick={onSave} disabled={locked || state.busy || !dirty} data-testid="race-meaning-save">{state.busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <span data-testid="race-meaning-status">Смыслы: озвучено {voice.done} из {voice.total}</span>
        <button type="button" className="aspChip" onClick={voice.voice} disabled={locked || voice.busy || dirty || !voice.total || allVoiced} data-testid="race-meaning-voice">{voice.busy ? 'Озвучиваю…' : allVoiced && voice.total ? 'Смыслы озвучены' : 'Озвучить смыслы (ElevenLabs)'}</button>
      </div>
      {voice.busy && voice.step && <div className="aspHint" role="status">озвучиваю {voice.step}…</div>}
      {state.note && <p className="rhpHint" role="status">{state.note}</p>}
      {state.error && <p className="aspErr" role="alert" data-testid="race-meaning-error">Не сохранилось: {state.error}</p>}
      {Object.keys(voice.errors).length > 0 && <p className="aspErr" role="alert">Не озвучилось: {Object.entries(voice.errors).map(([k, e]) => `${k} (${e})`).join('; ')}. Нужны права админа и доступ к ElevenLabs.</p>}
    </div>
  )
}
