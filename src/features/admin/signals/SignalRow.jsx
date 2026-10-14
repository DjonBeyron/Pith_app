import { STATUS_LABEL, GROUP_COLORS } from './signalTexts.js'

// Одна строка сигнала в левой колонке: название + статус-бейдж (кнопка выбора),
// тумблер, ползунок веса 0..100 с числом, полоска доли в сумме весов.
// Не-live (uiLocked): тумблер и вес заблокированы, но описание открывается.
export default function SignalRow({ meta, state, share, selected, onSelect, onWeight, onEnable }) {
  const locked = meta.uiLocked
  const on = !!state?.enabled
  const weight = state?.weight ?? 0
  const pct = Math.round(share * 100)
  const cls = ['slRow', selected && 'slRowSel', locked && 'slRowLocked', !locked && !on && 'slRowOff'].filter(Boolean).join(' ')

  return (
    <div className={cls} style={{ '--sl-color': GROUP_COLORS[meta.group] }}>
      <button className="slRowHead" onClick={onSelect} aria-pressed={selected} aria-label={`${meta.title}: открыть карточку`}>
        <span className="slRowTitle">{meta.title}</span>
        <span className={`slBadge slBadge-${meta.status}`}>{STATUS_LABEL[meta.status] ?? meta.status}</span>
      </button>
      <label className="slSwitch" title={locked ? 'Сигнал ещё не считается — включить нельзя' : (on ? 'Выключить сигнал' : 'Включить сигнал')}>
        <input type="checkbox" checked={on} disabled={locked} onChange={e => onEnable(e.target.checked)} aria-label={`${meta.title}: ${on ? 'включён' : 'выключен'}`} />
        <span className="slTrack" />
      </label>
      <div className="slWeight">
        <input
          type="range" min={0} max={100} step={1} value={weight} disabled={locked}
          onChange={e => onWeight(e.target.value)} className="slRange"
          aria-label={`${meta.title}: вес`} aria-valuetext={`${weight} из 100`}
        />
        <input
          type="number" min={0} max={100} step={1} value={weight} disabled={locked}
          onChange={e => onWeight(e.target.value)} className="slNum" aria-label={`${meta.title}: вес числом`}
        />
      </div>
      <div className="slShare" title={`Доля в сумме весов: ${pct}%`} aria-label={`Доля в сумме весов ${pct}%`}>
        <span className="slShareBar" style={{ width: `${Math.min(100, pct)}%` }} />
        <span className="slSharePct">{locked ? '—' : `${pct}%`}</span>
      </div>
    </div>
  )
}
