import { useState } from 'react'
import { AUDIO_PRESETS, presetById, presetInner, describePreset, CUSTOM } from '../../rehearsal/polish/audioPresets.js'
import { RUN_ORDER, runPresetId, runStatus } from '../../rehearsal/polish/audioRun.js'

// «Режим звука» и «Прогон по режимам» («Шлифовка репетиции»): селектор пресета A…H над карточками этапов (что внутри — подписью под ним), «Прогон по режимам» (этап → A, после выхода из игры B, … H;
// следующий режим запускается кнопкой «Запустить B»), копилка журналов запусков: «Экспорт прогонов» / «Очистить». a — результат usePolishAudioRun. acts — этапы [{ id, title }] с флагом ok (есть в плане).
// disabled — игра идёт или модуль ещё не готов; locked — игра идёт (селектор заблокирован).
export default function PolishAudioMode({ a, acts, disabled = false, locked = false, onRun, onContinue, onExport, note = '' }) {
  const [act, setAct] = useState('')
  const [armed, setArmed] = useState(false)
  const preset = presetById(a.selected)
  const pick = act || acts.find(x => x.ok)?.id || ''
  const run = a.run
  const custom = a.now === CUSTOM
  const running = !!run && run.state !== 'finished' // прогон идёт: выбор режима и этапа ведёт сам прогон
  return (
    <div className="rhpAudio" data-testid="rh-polish-audio">
      <label className="aspLabel">Режим звука для запуска (хрип голоса Пита)
        <select className="aspInput" value={a.selected} disabled={locked || running} onChange={e => a.select(e.target.value)} data-testid="rh-polish-audio-select">
          {AUDIO_PRESETS.map(p => <option key={p.id} value={p.id}>{p.id} — {p.title}</option>)}
        </select>
      </label>
      <p className="aspHint" data-testid="rh-polish-audio-inner"><strong>{describePreset(preset.id)}</strong> — внутри: {presetInner(preset)}. Применяется перед запуском этапа и пишется в журнал.</p>
      {custom && <p className="aspHint" data-testid="rh-polish-audio-custom">Сейчас настройки не совпадают ни с одним пресетом ({describePreset(CUSTOM)}); при запуске вернутся к {a.selected}.</p>}
      <div className="rhpRunRow">
        <label className="aspLabel">Этап для прогона
          <select className="aspInput" value={pick} disabled={locked || running} onChange={e => setAct(e.target.value)} data-testid="rh-polish-run-act">
            {acts.map(x => <option key={x.id} value={x.id} disabled={!x.ok}>{x.title}</option>)}
          </select>
        </label>
        <button type="button" className="aspSay" onClick={() => onRun(pick)} disabled={disabled || !pick || running} data-testid="rh-polish-run-modes">Прогон по режимам</button>
      </div>
      {run && (
        <div className="rhpRun" data-testid="rh-polish-run-status">
          <div className="aspHint" role="status">{runStatus(run)}</div>
          <div className="aspRow">
            {run.state === 'ready' && <button type="button" className="aspSay" onClick={onContinue} disabled={disabled} data-testid="rh-polish-run-next">Запустить {runPresetId(run)}</button>}
            <button type="button" className="aspChip" onClick={a.stopRun} disabled={locked} data-testid="rh-polish-run-stop">{run.state === 'finished' ? 'Закрыть прогон' : 'Остановить прогон'}</button>
          </div>
          <div className="aspHint" data-testid="rh-polish-run-steps">{RUN_ORDER.map((id, i) => `${id}${i < run.step || run.state === 'finished' ? ' ✓' : i === run.step ? ' ←' : ''}`).join('  ')}</div>
        </div>
      )}
      <div className="aspRow">
        <span className="aspHint" data-testid="rh-polish-runs-count">Журналов запусков в браузере: {a.count}</span>
        <button type="button" className="aspChip" onClick={onExport} disabled={!a.count} data-testid="rh-polish-runs-export">Экспорт прогонов</button>
        <button type="button" className="aspChip" onClick={() => { if (armed) { a.clear(); setArmed(false) } else setArmed(true) }} disabled={!a.count && !armed} data-testid="rh-polish-runs-clear">{armed ? 'Стереть точно?' : 'Очистить'}</button>
      </div>
      {note && <div className="aspHint" role="status" data-testid="rh-polish-runs-note">{note}</div>}
    </div>
  )
}
