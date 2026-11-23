import { SCENE_PAUSES } from '../../shared/lib/scenePauses.js'
import { gapKnobText } from './timelineKnobs.js'
import { sec as dur } from './montage/montageEditsText.js'
import TimelinePauseKnob from './TimelinePauseKnob.jsx'

// Блок «Чем задана эта тишина» у зазора или паузы (карточка блока, карточка паузы, правка зазора на монтаже): разложение тишины на настройки пауз, которые её дали, и «остальное» — то, что настройкой
// не является (ждём игрока, анимация, отсчёт, длина звука). Каждая настройка — сразу с управлением (TimelinePauseKnob). Сумма настроек не обязана равняться зазору — показано как есть.
// span — { t, end, kind }; knobs — usePauseKnobs; brief — одной строкой со ссылками «⚙ название значение» (карточки вкладки «Паузы»): нажатие открывает панель настроек на этой настройке.
const BY = Object.fromEntries(SCENE_PAUSES.map(p => [p.key, p]))

export default function TimelineGapKnobs({ span, knobs, brief = false }) {
  if (!knobs || !span) return null
  const r = knobs.of(span), uniq = [...new Map(r.parts.map(p => [p.key, p])).values()]
  if (brief) {
    if (!r.recorded || !uniq.length) return <p className="tlGapKnobs tlGapKnobsBrief" data-testid="tl-gap-knobs" data-recorded={r.recorded ? '1' : '0'}>{r.recorded ? <span className="tlMuted">⚙ настройками не задана — {r.restWhy}</span> : <span className="tlMuted">⚙ настройки в этой игре не записаны (игра до v3.3.351) — сыграй заново</span>}</p>
    return (
      <p className="tlGapKnobs tlGapKnobsBrief" data-testid="tl-gap-knobs" data-recorded="1">
        {uniq.map(p => <button key={p.key} type="button" className="tlKnobChip" data-set={p.set ? '1' : undefined} onClick={() => knobs.show(p.key)} title={`${p.where} — нажми, чтобы изменить`} data-testid="tl-knob-chip">⚙ {p.title} {dur(p.ms)}{p.set ? ' · изменена' : ''}</button>)}
        {r.rest >= 20 && <span className="tlMuted"> + остальное {dur(r.rest)} ({r.restWhy})</span>}
      </p>
    )
  }
  return (
    <section className="tlGapKnobs" data-testid="tl-gap-knobs" data-recorded={r.recorded ? '1' : '0'}>
      <h5 className="tlGapKnobsH">Чем задана эта тишина</h5>
      <p className="tlGapKnobsSum" data-testid="tl-gap-knobs-sum">{gapKnobText(r)}</p>
      {uniq.map(p => <TimelinePauseKnob key={p.key} p={BY[p.key]} knobs={knobs} note={`в этой тишине: ${dur(p.part)} из ${dur(r.ms)}${p.how === 'stage' ? ' (настройка запечена в стадию — место отсчёта оценено)' : ''}`} />)}
      {r.recorded && uniq.length > 0 && knobs.can && <p className="tlMuted">Меняется черновик. Чтобы игра изменилась — <button type="button" className="tlLink" onClick={() => knobs.show()} data-testid="tl-gap-knobs-open">⚙ Настройки пауз</button>: «попробовать на этом устройстве» или «для всех игроков».</p>}
    </section>
  )
}
