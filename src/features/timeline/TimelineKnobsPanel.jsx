import { useState } from 'react'
import { SCENE_PAUSES } from '../../shared/lib/scenePauses.js'
import { overridesText } from './timelineKnobs.js'
import TimelinePauseKnob from './TimelinePauseKnob.jsx'
import TimelinePauseApply from './TimelinePauseApply.jsx'
import '../../styles/timeline-knobs.css'

// Панель «⚙ Настройки пауз» экрана таймлайна (поверх экрана): все 13 настроек по этапам игры — название, между чем и чем, значение, откуда оно, умолчание, пределы, сколько раз сработала в выбранной игре
// и сколько секунд дала; у каждой — управление (TimelinePauseKnob). Сверху простыми словами, что это такое, и состояние: что изменено на этом устройстве, на сервере, что действовало в выбранной игре.
// Фильтр «только изменённые». Применение — TimelinePauseApply. knobs — usePauseKnobs; only0 / ask0 — начальное состояние фильтра и подтверждения (тесты разметки).
export default function TimelineKnobsPanel({ knobs, only0 = false, ask0 = '' }) {
  const [only, setOnly] = useState(only0)
  if (!knobs?.open) return null
  const k = knobs, changed = p => k.value(p.key) !== p.def || k.eff.values[p.key] !== p.def
  const list = SCENE_PAUSES.filter(p => (k.focus ? p.key === k.focus : !only || changed(p)))
  const groups = [...new Set(list.map(p => p.group))]
  const ov = overridesText(k.overrides)
  return (
    <div className="tlKnobs" role="dialog" aria-label="Настройки пауз" data-testid="tl-knobs" onClick={e => { if (e.target === e.currentTarget) k.hide() }}>
      <div className="tlKnobsCard">
        <header className="tlKnobsHead">
          <b>⚙ Настройки пауз</b>
          <button type="button" className="tlBtn" onClick={k.hide} data-testid="tl-knobs-close">✕ Закрыть</button>
        </header>
        <p className="tlKnobsWhat" data-testid="tl-knobs-what">Настройка — это пауза в сценарии игры, которую можно менять без программиста: «сколько ждать между чем и чем». Здесь ты меняешь <b>черновик</b>; игра не изменится, пока не нажмёшь одну из двух кнопок внизу. Новые значения действуют со следующей игры.</p>
        <p className="tlKnobsState" data-testid="tl-knobs-state">
          <span data-n={k.deviceCount}>📱 на этом устройстве изменено: <b>{k.deviceCount}</b></span>
          <span data-n={k.serverCount}>🌍 на сервере (у всех) изменено: <b>{k.srv.status === 'loading' ? '…' : k.srv.status === 'error' ? '?' : k.serverCount}</b></span>
          <span>🎬 в этой игре действовало: <b>{!k.k.recorded ? 'не записано (игра до v3.3.351)' : ov || 'всё по умолчанию'}</b></span>
          {k.srv.status === 'error' && <span className="tlKnobErr">сервер не ответил: {k.srv.error} — значения для всех неизвестны</span>}
        </p>
        <div className="tlApplyRow">
          {k.focus ? <button type="button" className="tlChip" onClick={() => k.show(null)} data-testid="tl-knobs-all">← все 13 настроек</button>
            : <label className="tlKnobsOnly"><input type="checkbox" checked={only} onChange={e => setOnly(e.target.checked)} data-testid="tl-knobs-only" /> только изменённые</label>}
          <button type="button" className="tlChip" onClick={k.allDefault} disabled={!k.can} title="Поставить в черновике все настройки по умолчанию (ещё не применено)" data-testid="tl-knobs-all-default">все по умолчанию (в черновике)</button>
        </div>
        <div className="tlKnobsList" data-testid="tl-knobs-list">
          {groups.map(g => (
            <section key={g} className="tlKnobsGroup">
              <h4>{g}</h4>
              {list.filter(p => p.group === g).map(p => <TimelinePauseKnob key={p.key} p={p} knobs={k} focus={k.focus === p.key} />)}
            </section>
          ))}
          {!list.length && <p className="tlMuted" data-testid="tl-knobs-none">Изменённых настроек нет: все паузы по умолчанию.</p>}
        </div>
        {k.can ? <TimelinePauseApply knobs={k} ask0={ask0} /> : <p className="tlMuted">Здесь только показ: менять настройки можно из админки (Админ → «Голос» → «🎬 Таймлайн игры»).</p>}
      </div>
    </div>
  )
}
