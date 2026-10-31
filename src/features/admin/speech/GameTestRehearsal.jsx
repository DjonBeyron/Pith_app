import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import RotatePhoneModule from '../../player/modules/rotate-phone/RotatePhoneModule.jsx'
import { getCatLines } from '../../../shared/api/catLinesApi.js'
import { normalizeLines } from '../../player/modules/rotate-phone/wordLaneCatLines.js'
import { FIXTURES, FIXTURE_IDS } from '../../rehearsal/rehearsalFixtures.js'
import { parsePlanJson, textRows, fixtureJson } from '../../rehearsal/rehearsalTestForm.js'
import { pitVoiceCount, voiceMissingPitLines, voiceMissingTexts } from '../../rehearsal/rehearsalVoice.js'

// «Тест игры» → «Репетиция (симуляция)» (CONCEPT_REHEARSAL.md): та же игра, но сценарий «Репетиция с Питом» по плану — фикстура на выбор и JSON плана, который можно править (он запоминается в браузере админа).
// «Озвучить» — озвучка всех кусков, слов и двойников плана в библиотеку слов (как у кусков в обычном тесте) и реплик Пита (настройки приложения, как в редакторе ноды). «Запустить репетицию» — тот же RotatePhoneModule
// с синтетической нодой { rotate_phone: { plan } }; тап по кнопке — жест (микрофон, звук, полный экран). Результаты на сервер не пишутся: итог — в симуляции памяти (rehearsalSim, sessionStorage) и журнале отладки.
export default function GameTestRehearsal({ form, onChange, lib, generate }) {
  const [voicing, setVoicing] = useState('')   // что озвучивается сейчас (ключ слова или id реплики)
  const [errors, setErrors] = useState({})
  const [pit, setPit] = useState(null)         // реплики кота из настроек приложения (для счётчика озвучки)
  const [rev, setRev] = useState(0)            // растёт после озвучки реплик: модуль перемонтируется и берёт свежие реплики
  const [status, setStatus] = useState({ phase: 'wait', busy: false, ready: false, problem: '' })
  const [runs, setRuns] = useState(0)
  const startRef = useRef(null)
  useEffect(() => { getCatLines().then(raw => setPit(normalizeLines(raw))) }, [rev])

  const { plan, error } = useMemo(() => parsePlanJson(form.json), [form.json])
  const rows = plan ? textRows(plan, lib) : []
  const missing = rows.filter(r => r.key && !r.has)
  const count = pitVoiceCount(pit)
  const playing = status.phase === 'game'
  const node = useMemo(() => ({ id: 'rh-test', type: 'rotate_phone', isHistory: false, typeData: { rotate_phone: { plan } } }), [plan])
  const onDone = useCallback(() => setRuns(n => n + 1), [])

  async function voice() {
    const { failed } = await voiceMissingTexts(rows, generate, setVoicing)
    try { await voiceMissingPitLines({ onStep: setVoicing }) } catch (e) { failed.pit = e?.message || String(e) }
    setVoicing(''); setErrors(failed); setRev(n => n + 1)
  }

  return (
    <>
      <label className="aspLabel">Фикстура
        <select className="aspInput" value={form.fixture} disabled={playing} onChange={e => onChange({ fixture: e.target.value, json: fixtureJson(e.target.value) })} data-testid="rh-test-fixture">
          {FIXTURE_IDS.map(id => <option key={id} value={id}>{FIXTURES[id].title}</option>)}
        </select>
      </label>
      <label className="aspLabel">План (JSON: phrase, translation, words[{`{text, translation, due, lapses, confusers}`}], stressed, seed — семя случайностей, пусто: от даты)
        <textarea className="aspInput aspJson" rows={12} spellCheck={false} value={form.json} disabled={playing} onChange={e => onChange({ json: e.target.value })} data-testid="rh-test-json" />
      </label>
      {error && <p className="aspErr" role="alert" data-testid="rh-test-error">{error}</p>}
      <ul className="aspHint" data-testid="rh-test-rows">
        {rows.map((r, i) => (
          <li key={`${i}-${r.text}`} data-state={!r.key ? 'skip' : voicing === r.key ? 'busy' : r.has ? 'ok' : 'missing'}>
            «{r.text}» — {!r.key ? 'не для озвучки' : voicing === r.key ? 'озвучиваю…' : r.has ? <span className="aspOk">есть озвучка</span> : <span className="aspBad">нет озвучки</span>}
            {errors[r.key] && <span className="aspErr" role="alert"> {errors[r.key]}</span>}
          </li>
        ))}
        <li data-testid="rh-test-pit">Реплики Пита: озвучено {count.done} из {count.total}{errors.pit && <span className="aspErr" role="alert"> {errors.pit}</span>}</li>
      </ul>
      <div className="aspRow">
        <button type="button" className="aspChip" onClick={voice} disabled={!!voicing || playing || (!missing.length && count.done === count.total) || !lib || !plan} data-testid="rh-test-voice">{voicing ? 'Озвучиваю…' : missing.length || count.done < count.total ? `Озвучить (${missing.length}${count.done < count.total ? ` + реплики ${count.total - count.done}` : ''})` : 'Всё озвучено'}</button>
        <button type="button" className="aspSay" onClick={() => startRef.current?.()} disabled={!plan || playing || status.busy || !status.ready} data-testid="rh-test-start">{runs > 0 ? 'Ещё раз' : 'Запустить репетицию'}</button>
      </div>
      {plan && <RotatePhoneModule key={rev} node={node} bare forceDebug startRef={startRef} onStatus={setStatus} onDone={onDone} />}
      <p className="aspHint">Репетиция идёт по плану выше: разминка, читка, сборка с конца, без текста, «Различи» (у слов с двойниками), дубль, зеркало (пока заглушка), итог. «Ещё минутку?» ведёт к следующей фикстуре. Для проверки без голоса включи в ⚙ «Тап вместо речи». Слова без озвучки прозвучат голосом системы. Результаты не сохраняются, XP не начисляется — итог только в симуляции памяти сессии и в журнале отладки.</p>
    </>
  )
}
