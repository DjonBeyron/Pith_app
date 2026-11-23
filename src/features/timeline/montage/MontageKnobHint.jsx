import { gapInfo } from './montageEdits.js'
import { groupBefore } from './montageModel.js'
import { knobForEdit } from '../timelineKnobs.js'
import { sec as dur } from './montageEditsText.js'
import TimelineGapKnobs from '../TimelineGapKnobs.jsx'

// Связь правки монтажа с настройками пауз (режим «Правка», под правкой выбранного зазора): правка монтажа — только список для разработчика, а настройка паузы меняет игру сама.
//  • зазор целиком (≥ 80 % сдвигаемой части) задан ОДНОЙ настройкой и есть правка → «этот зазор задаёт настройка „…“ — изменить настройку: 1,3 с → 0,6 с»: кнопка кладёт значение в черновик настроек
//    и убирает правку монтажа (она больше не нужна);
//  • настроек несколько или есть несдвигаемая часть → разложение тишины и управление каждой настройкой (TimelineGapKnobs);
//  • настройками зазор не задан — правка остаётся как есть (список для разработчика).
// sel — ключ клипа, перед которым тишина; edit — правка этого клипа или null; knobs — usePauseKnobs; revert(key) — убрать правку монтажа.
export default function MontageKnobHint({ base, sel, edit = null, knobs = null, revert }) {
  const info = knobs && sel ? gapInfo(base, sel) : null, grp = info ? groupBefore(base, info.clip) : null
  if (!grp) return null
  const span = { t: grp.t, end: grp.end, kind: new Set(grp.pieces.map(x => x.kind)).size > 1 ? 'mixed' : grp.pieces[0]?.kind ?? 'dead' }, r = knobs.of(span), one = knobForEdit(r, info.flex, edit)
  if (!r.recorded) return <div className="mtgKnobHint" data-testid="mtg-knob-hint" data-mode="old"><p>⚙ В этой игре настройки пауз не записаны (игра до v3.3.351) — сыграй заново, и здесь будет видно, какая настройка задаёт эту тишину. Правка остаётся в списке для разработчика.</p></div>
  if (!r.parts.length) return <div className="mtgKnobHint" data-testid="mtg-knob-hint" data-mode="none"><p>⚙ Эту тишину настройки пауз не задают ({r.restWhy}). Правка остаётся в списке для разработчика.</p></div>
  if (one) {
    return (
      <div className="mtgKnobHint" data-testid="mtg-knob-hint" data-mode="one">
        <p>⚙ Этот зазор задаёт настройка <b>«{one.title}»</b> — изменить настройку: <b>{dur(one.from)} → {dur(one.to)}</b>{one.clamped ? ' (дальше нельзя — предел настройки)' : ''}. Тогда игра изменится сама, без программиста.</p>
        <div className="tlApplyRow">
          <button type="button" className="tlChip tlApplyDevice" disabled={!knobs.can} onClick={() => { if (!knobs.set(one.key, one.to)) { revert(sel); knobs.show(one.key) } }} data-testid="mtg-knob-move">перенести в настройки: {dur(one.to)}</button>
          <span className="tlMuted">правка монтажа уберётся, значение попадёт в черновик настроек</span>
        </div>
      </div>
    )
  }
  return (
    <div className="mtgKnobHint" data-testid="mtg-knob-hint" data-mode="many">
      <p>⚙ Эта тишина сложена из нескольких частей{info.locked > 0 ? `, ${dur(info.locked)} из неё не сдвигается (игрок, отсчёт, техника)` : ''} — меняй нужную настройку:</p>
      <TimelineGapKnobs span={span} knobs={knobs} />
    </div>
  )
}
