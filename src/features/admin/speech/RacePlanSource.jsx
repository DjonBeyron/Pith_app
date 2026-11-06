import { useState, useEffect, useRef } from 'react'
import { pLog } from '../../../shared/lib/debug.js'
import { loadPlanDeps } from '../../pitrace/plan/racePlanSources.js'
import { summarizePlan, summaryText, planLogLine } from '../../pitrace/plan/racePlanSummary.js'

// Админ → «Голос» → «Встряхни память (стенд)» → «Настройки»: переключатель «План: фикстура / из памяти» (этап 2 «Фразы», CONCEPT_RACE.md → «Данные: план из памяти»). Выбор помнится в localStorage.
// «Из памяти» — грузит данные (racePlanSources.loadPlanDeps) и отдаёт их наверх (onDeps): RaceBlock пропускает план через buildMemoryPlan перед запуском; «фикстура» — onDeps(null).
// Под переключателем — короткая сводка (слова памяти, свои и дежурные фразы, у каких нет смысла / озвучки); та же сводка одной строкой «[plan] …» уходит в журнал (pLog) при каждой смене плана.
export const PLAN_SOURCE_KEY = 'pithy_race_plan_source_v1'
const readSource = () => { try { return globalThis.localStorage?.getItem(PLAN_SOURCE_KEY) === 'memory' ? 'memory' : 'fixture' } catch { return 'fixture' } }
const writeSource = v => { try { globalThis.localStorage?.setItem(PLAN_SOURCE_KEY, v) } catch { /* приватный режим — до перезагрузки */ } }

export default function RacePlanSource({ plan, locked = false, onDeps, load = loadPlanDeps }) {
  const [source, setSource] = useState(readSource)
  const [loaded, setLoaded] = useState({ rev: -1, deps: null }) // что загружено и на каком «Обновить»
  const [rev, setRev] = useState(0)
  const logged = useRef('')

  useEffect(() => {
    if (source !== 'memory') { onDeps?.(null); return undefined }
    let alive = true
    load({ force: rev > 0 }).then(d => { if (!alive) return; setLoaded({ rev, deps: d }); onDeps?.(d) })
    return () => { alive = false }
  }, [source, rev, load, onDeps])

  const memory = source === 'memory'
  const busy = memory && loaded.rev !== rev
  const deps = loaded.deps
  const s = plan ? summarizePlan(plan, memory ? deps : null) : null
  const line = s ? planLogLine(s) : ''
  useEffect(() => { if (line && line !== logged.current && (!memory || deps)) { logged.current = line; pLog(line) } }, [line, memory, deps])

  const pick = v => { setSource(v); writeSource(v) }
  return (
    <div data-testid="race-plan-source">
      <label className="aspLabel">План
        <select className="aspInput" value={source} disabled={locked} onChange={e => pick(e.target.value)} data-testid="race-plan-pick">
          <option value="fixture">фикстура</option>
          <option value="memory">из памяти</option>
        </select>
      </label>
      {memory && (
        <div className="rhpVoiceRow">
          <span className="rhpHint" data-testid="race-plan-summary">{busy ? 'загружаю память…' : s && deps ? summaryText(s) : '—'}</span>
          <button type="button" className="aspChip" onClick={() => setRev(r => r + 1)} disabled={locked || busy} data-testid="race-plan-reload">Обновить</button>
        </div>
      )}
      {memory && s && deps && !busy && (s.noRu.length > 0 || s.noAudio.length > 0 || s.noRuVoice.length > 0) && (
        <p className="rhpHint" data-testid="race-plan-missing">
          {s.noRu.length > 0 && <>Без смысла: {s.noRu.join(', ')}. </>}
          {s.noAudio.length > 0 && <>Без озвучки фразы (Пит прочтёт по словам): {s.noAudio.join(', ')}. </>}
          {s.noRuVoice.length > 0 && <>Без озвучки смысла: {s.noRuVoice.join(', ')}.</>}
        </p>
      )}
      {memory && s?.errors.length > 0 && <p className="aspErr" role="alert" data-testid="race-plan-error">Не загрузилось: {s.errors.join('; ')}</p>}
    </div>
  )
}
