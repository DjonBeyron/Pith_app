import { useState, useEffect, useMemo, useCallback } from 'react'
import { getAppSetting, saveAppSetting } from '../../../shared/api/appSettingsApi.js'
import { transKey } from '../../pitrace/raceTrans.js'
import { RACE_PHRASE_RU_KEY, RACE_PHRASE_SCENE_KEY, MEANING_HINT, SCENE_HINT, meaningMap, meaningRows, mergeMeanings, isDirty, meaningTexts } from './racePhraseMeaning.js'
import useTransVoice from './useTransVoice.js'

// Админ → «Голос» → «Встряхни память (стенд)» → «Смысл фразы» (этап 2 «Фразы», CONCEPT_PHRASES.md): у каждой фразы плана два поля —
// «Смысл (круг 2)» — русское НАМЕРЕНИЕ («скажи, что рад знакомству»), его Пит говорит в круге «Скажи» / «Узнай»; «Ситуация (круг 1)» — контекст без подсказки слов
// («ты знакомишься с новым человеком»), её Пит говорит в круге «Пойми» (пусто — там тоже смысл). Сохранение — по кнопке «Сохранить» в app_settings.race_phrase_ru и
// app_settings.race_phrase_scene ({ [key]: text }); озвучка — та же, что у переводов слов (useTransVoice: ElevenLabs → R2 → word_audio, ключ transKey(текст)),
// в игре Пит говорит через sayText(текст, { ru: true }). Фраза без целой озвучки (audio === null) помечена «читается по словам».
const loadMeanings = () => getAppSetting(RACE_PHRASE_RU_KEY)
const saveMeanings = value => saveAppSetting(RACE_PHRASE_RU_KEY, value)
const loadScenes = () => getAppSetting(RACE_PHRASE_SCENE_KEY)
const saveScenes = value => saveAppSetting(RACE_PHRASE_SCENE_KEY, value)

function useSaved(load) {
  const [saved, setSaved] = useState({})
  useEffect(() => {
    let live = true
    Promise.resolve(load()).then(v => { if (live) setSaved(meaningMap(v)) }).catch(() => {})
    return () => { live = false }
  }, [load])
  return [saved, setSaved]
}

export default function RacePhraseMeaning({ plan, locked = false, load = loadMeanings, save = saveMeanings, loadScene = loadScenes, saveScene = saveScenes }) {
  const [saved, setSaved] = useSaved(load)
  const [savedScene, setSavedScene] = useSaved(loadScene)
  const [drafts, setDrafts] = useState({})
  const [sceneDrafts, setSceneDrafts] = useState({})
  const [state, setState] = useState({ busy: false, error: '', note: '' })
  const rows = useMemo(() => meaningRows(plan, saved, savedScene), [plan, saved, savedScene])
  const texts = useCallback(() => meaningTexts(rows), [rows])
  const voice = useTransVoice({ plan, texts })
  const voiced = new Set(voice.rows.filter(r => r.has).map(r => r.key))
  const ruDirty = isDirty(saved, drafts), sceneDirty = isDirty(savedScene, sceneDrafts)
  const dirty = ruDirty || sceneDirty
  const allVoiced = voice.done >= voice.total
  const off = locked || state.busy
  const mark = t => t && <span className="rhpHint"> · {voiced.has(transKey(t)) ? 'озвучено' : 'не озвучено'}</span>

  async function onSave() {
    setState({ busy: true, error: '', note: '' })
    try {
      if (ruDirty) { const next = mergeMeanings(saved, drafts); await save(next); setSaved(next); setDrafts({}) }
      if (sceneDirty) { const next = mergeMeanings(savedScene, sceneDrafts); await saveScene(next); setSavedScene(next); setSceneDrafts({}) }
      setState({ busy: false, error: '', note: 'Смыслы и ситуации сохранены' })
    } catch (e) { setState({ busy: false, error: e?.message || String(e), note: '' }) }
  }

  return (
    <div className="rhpVoice" data-testid="race-meaning">
      <h4 className="aspH">Смысл фразы (этап 2)</h4>
      {!rows.length && <p className="rhpHint" data-testid="race-meaning-empty">В плане нет фраз</p>}
      {rows.map(r => (
        <div key={r.key} data-testid={`race-meaning-${r.key}`}>
          <div className="aspLabel">{r.text}{r.byWords && <span className="rhpHint" data-testid="race-meaning-bywords"> · читается по словам</span>}</div>
          <label className="aspLabel">
            <span>Смысл (круг 2){mark(r.ru)}</span>
            <input className="aspInput" type="text" value={drafts[r.key] ?? r.ru} placeholder={`Смысл по-русски (намерение, не перевод): «${MEANING_HINT}»`} disabled={off}
              onChange={e => { const v = e.target.value; setDrafts(d => ({ ...d, [r.key]: v })) }} />
          </label>
          <label className="aspLabel" data-testid={`race-scene-${r.key}`}>
            <span>Ситуация (круг 1){mark(r.scene)}</span>
            <input className="aspInput" type="text" value={sceneDrafts[r.key] ?? r.scene} placeholder={SCENE_HINT} disabled={off}
              onChange={e => { const v = e.target.value; setSceneDrafts(d => ({ ...d, [r.key]: v })) }} />
          </label>
        </div>
      ))}
      <div className="rhpVoiceRow">
        <button type="button" className="aspChip" onClick={onSave} disabled={off || !dirty} data-testid="race-meaning-save">{state.busy ? 'Сохраняю…' : 'Сохранить'}</button>
        <span data-testid="race-meaning-status">Смыслы и ситуации: озвучено {voice.done} из {voice.total}</span>
        <button type="button" className="aspChip" onClick={voice.voice} disabled={locked || voice.busy || dirty || !voice.total || allVoiced} data-testid="race-meaning-voice">{voice.busy ? 'Озвучиваю…' : allVoiced && voice.total ? 'Смыслы озвучены' : 'Озвучить смыслы (ElevenLabs)'}</button>
      </div>
      {voice.busy && voice.step && <div className="aspHint" role="status">озвучиваю {voice.step}…</div>}
      {state.note && <p className="rhpHint" role="status">{state.note}</p>}
      {state.error && <p className="aspErr" role="alert" data-testid="race-meaning-error">Не сохранилось: {state.error}</p>}
      {Object.keys(voice.errors).length > 0 && <p className="aspErr" role="alert">Не озвучилось: {Object.entries(voice.errors).map(([k, e]) => `${k} (${e})`).join('; ')}. Нужны права админа и доступ к ElevenLabs.</p>}
    </div>
  )
}
