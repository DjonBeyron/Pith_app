import { CAPTURE_MODES, CAPTURE_LABEL, CAPTURE_SHORT, CAPTURE_HINT, NO_LEVEL_HINT, isWarmMode, toPercent, fmtPercent } from './speechCapture.js'

// Статус полоски уровня по состоянию менеджера потока и выбранному режиму
function meterNote(mode, st) {
  if (!isWarmMode(mode)) return NO_LEVEL_HINT
  if (st.status === 'opening') return 'Открываем микрофон для замера…'
  if (st.status === 'error') return `Замер уровня не получился (${st.error}). Распознавание идёт и без него.`
  if (st.status === 'ended') return st.hadSamples ? `Пик последней попытки: ${fmtPercent(toPercent(st.peak))}` : 'Замера уровня не было (поток не успел открыться).'
  if (st.status === 'live') return null
  return 'Уровень появится после нажатия «Сказать».'
}

// Переключатель режима захвата (A/B/C) и живая полоска уровня звука + пик попытки. Режим меняется только вне попытки.
export default function SpeechCaptureBlock({ mode, setMode, state, busy }) {
  const warm = isWarmMode(mode)
  const level = toPercent(state.level) ?? 0
  const note = meterNote(mode, state)
  return (
    <div className="aspCap">
      <div className="aspRow">
        <span className="aspLabelInline">Захват</span>
        {CAPTURE_MODES.map(m => (
          <button key={m} className={`aspChip${m === mode ? ' aspChipOn' : ''}`} disabled={busy} onClick={() => setMode(m)}>
            {CAPTURE_SHORT[m]} · {CAPTURE_LABEL[m]}{m !== 'plain' && <i className="aspExp"> эксперимент</i>}
          </button>
        ))}
      </div>
      <div className="aspHint">{CAPTURE_HINT[mode]}</div>
      {warm && (state.status === 'live' || state.status === 'ended') && (
        <div className="aspMeter" aria-label="Уровень звука">
          <div className="aspMeterBar"><div className="aspMeterFill" style={{ width: `${level}%` }} /></div>
          <span className="aspMeterNum">{state.status === 'live' ? `${level}%` : '—'} · пик {fmtPercent(toPercent(state.peak))}</span>
        </div>
      )}
      {note && <div className="aspHint">{note}</div>}
      {state.status === 'live' && state.agc === false && <div className="aspHint">Браузер не включил автоусиление (AGC) для этого потока.</div>}
    </div>
  )
}
