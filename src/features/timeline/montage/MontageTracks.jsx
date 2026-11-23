import { useMemo } from 'react'
import { visible, axisTicks } from '../timelineView.js'
import { clock, dur, RES } from '../timelineFormat.js'
import MontageClip from './MontageClip.jsx'
import MontageGap from './MontageGap.jsx'
import { voiceKey } from '../timelineVoice.js'

// Дорожки монтажного стола (CONCEPT_TIMELINE.md, «Монтаж»): время слева направо, слои сверху вниз — линейка, «Этапы», «Пит», «Мия», «Диктор», «Пилюли / игрок», «Ноты и ожидания». Подписи слоёв закреплены слева.
// Поверх трёх дорожек речи — зазоры (колонки тишины с числом секунд); через все дорожки — вертикальные линии начала этапов и указатель. В DOM только то, что попало в окно времени win
// (timelineView.visible): длинная игра — тысячи событий, на экране — сотни узлов; отрезки уже 3 px сливаются в «×N».
// Нажатие на этап, пилюлю, ответ игрока и отметку (отсчёт / техника / пауза игры) выбирает блок (data-pick — вид, data-t — начало: щелчок ловит стол, TimelineMontage); picked — выбранный блок { kind, t }.
// play — звук клипа { key, status, sec } (useClipAudio): клип с этим ключом показывает ход проигрывания.
// Строки сетки: 1 линейка · 2 этапы · 3–5 речь · 6 пилюли · 7 ноты. Слои-накладки (зазоры, линии) не ловят мышь, кроме самих зазоров.
const SPEECH = [['pit', 'Пит'], ['mia', 'Мия'], ['dictor', 'Диктор']]
const MARK = { count: 'отсчёт ♪♪♪', wait: 'техника', hold: 'пауза игры' }
const box = (v, scale) => ({ left: v.t * scale, width: Math.max(2, (v.end - v.t) * scale) })
const many = (v, scale) => <i key={`m${v.t}`} className="mtgMany" style={box(v, scale)} title={`${v.n} отрезков — увеличь масштаб`}>{(v.end - v.t) * scale > 22 ? `×${v.n}` : ''}</i>

export default function MontageTracks({ mont, scale, win, labelW, ph, sel = null, selGap = null, edit = false, moved = null, marked = null, drag = null, play = null, picked = null, voiceMarks = null, gapKnob = null, onDown, onPick, onGap, onScrub }) {
  const total = Math.max(1, Math.ceil(mont.dur * scale))
  const by = useMemo(() => Object.fromEntries(SPEECH.map(([who]) => [who, mont.clips.filter(c => c.who === who)])), [mont])
  const ax = axisTicks(win, scale, mont.dur, 72)
  const lane = { width: total }
  const pk = (kind, it) => ({ 'data-pick': kind, 'data-t': it.t, 'data-on': picked && picked.t === it.t && (picked.kind === kind || (kind === 'mark' && picked.kind === it.kind)) ? '1' : undefined })
  const playOf = c => (play && play.key === voiceKey(c.ref) ? play : null)
  const row = (n, key, label, body, extra = {}) => (
    <div key={key} className="mtgRow" data-row={key} style={{ gridRow: n }} {...extra}>
      <div className="mtgLabel">{label}</div>
      <div className="mtgLane" style={lane}>{body}</div>
    </div>
  )
  return (
    <div className="mtgCanvas" style={{ width: labelW + total, '--mtg-label': `${labelW}px` }} data-testid="mtg-canvas" data-scale={scale.toFixed(5)}>
      <div className="mtgOver mtgGaps" style={{ gridRow: '3 / 6', width: total }}>
        {visible(mont.gaps, win, scale, 3, g => g.long).map(v => (v.item ? <MontageGap key={`g${v.item.t}`} g={v.item} scale={scale} on={selGap != null && v.item.g === selGap} onPick={onGap} knob={gapKnob?.(v.item) ?? null} /> : <i key={`m${v.t}`} className="mtgGapMany" style={box(v, scale)} />))}
      </div>
      {row(1, 'ruler', 'время', ax.ticks.map(t => <span key={t} className="mtgTick" style={{ left: t * scale }}>{clock(t, ax.step < 1000)}</span>), { 'data-ruler': '1', onPointerDown: onScrub, title: 'Нажми или тяни — указатель встанет в этот момент' })}
      {row(2, 'stages', 'Этапы', visible(mont.stages, win, scale).map(v => (v.item
        ? <i key={`s${v.item.t}`} className="mtgStage" style={box(v, scale)} {...pk('stage', v.item)} data-act={v.item.act} data-type={v.item.type} title={`${v.item.title} [${v.item.sid}] — ${dur(v.item.end - v.item.t)}`}><span>{v.item.title}<em> · {dur(v.item.end - v.item.t)}</em></span></i>
        : many(v, scale))))}
      {SPEECH.map(([who, label], i) => row(3 + i, who, label, visible(by[who], win, scale).map(v => (v.item
        ? <MontageClip key={v.item.key} c={v.item} scale={scale} on={sel === v.item.key} edit={edit} moved={!!marked?.has(v.item.key)} warn={!!v.item.over && !!(moved?.has(v.item.key) || moved?.has(v.item.over))} drag={drag?.key === v.item.key} hit={drag?.key === v.item.key && !!drag.hit} play={playOf(v.item)?.status ?? null} playSec={playOf(v.item)?.sec ?? 0} canPlay={!!play} mark={v.item.who === 'dictor' ? null : voiceMarks?.[v.item.id] ?? null} onDown={onDown} onPick={onPick} />
        : many(v, scale)))))}
      {row(6, 'pills', <>Пилюли<br />игрок</>, <>
        {visible(mont.pills, win, scale).map(v => (v.item ? <i key={`p${v.item.t}`} className="mtgPill" style={box(v, scale)} {...pk('turn', v.item)} data-res={v.item.res} title={`${v.item.phrase ? 'ход фразы' : 'пилюля'} «${v.item.word}» на экране ${dur(v.item.end - v.item.t)} — ${RES[v.item.res] ?? v.item.res}`}><span>{v.item.word}</span></i> : many(v, scale)))}
        {visible(mont.answers, win, scale, 0).map(v => v.item && <i key={`a${v.item.t}`} className="mtgAns" style={{ left: v.item.t * scale }} {...pk('answer', v.item)} data-res={v.item.res} title={`игрок: ${RES[v.item.res] ?? v.item.res} ${v.item.word}`}>{v.item.res === 'win' || v.item.res === 'late' ? '✓' : '✗'}</i>)}
      </>)}
      {row(7, 'marks', <>Ноты<br />ожидания</>, <>
        {visible(mont.marks, win, scale).map(v => (v.item ? <i key={`k${v.item.kind}${v.item.t}`} className="mtgMark" style={box(v, scale)} {...pk('mark', v.item)} data-kind={v.item.kind} title={`${v.item.text} — ${dur(v.item.end - v.item.t)}`}><span>{MARK[v.item.kind]} {dur(v.item.end - v.item.t)}</span></i> : many(v, scale)))}
        {scale >= 0.008 && visible(mont.notes, win, scale, 0).map(v => v.item && <i key={`n${v.item.t}`} className="mtgNote" style={{ left: v.item.t * scale }} title="нота (ответ принят)">♪</i>)}
      </>)}
      <div className="mtgOver mtgLines" style={{ gridRow: '1 / 8', width: total }}>
        {visible(mont.stages, win, scale, 0).map(v => v.item && <i key={`l${v.item.t}`} className="mtgStageLine" style={{ left: v.item.t * scale }} data-act={v.item.act} />)}
        <i className="mtgPlayhead" style={{ left: ph * scale }} data-testid="mtg-playhead"><b>{clock(ph, true)}</b></i>
      </div>
    </div>
  )
}
