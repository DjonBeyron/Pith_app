import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { visible, windowOf, axisTicks, scrollFor } from './timelineView.js'
import { clock, dur, WHO, RES } from './timelineFormat.js'
import { stageTitle } from './timelineStageNames.js'
import { useMiddlePan } from './montage/useMiddlePan.js'

// Лента «Таймлайна игры»: ось времени по горизонтали, дорожки строками, подписи дорожек закреплены слева (sticky). Стадии подписаны названием для админа (timelineStageNames.js), реплики — реальным текстом. Прокрутка — ВНУТРИ ленты (страница по горизонтали не едет).
// В DOM только то, что попало в видимое окно времени (timelineView.visible): длинная игра не превращается в тысячи узлов; узкие соседние отрезки сливаются в блок «×N».
// focus — { t, n }: прокрутить к моменту t (нажатие на паузу в списке); onPick({ kind, ref }) — карточка отрезка. Зажатая средняя кнопка мыши двигает ленту в любом её месте (useMiddlePan), как на «Монтаже».
const LABEL_W = 62
const ROWS = [['stages', 'Этапы'], ['pauses', 'Паузы'], ['pit', 'Пит'], ['mia', 'Мия'], ['dictor', 'Диктор'], ['turns', 'Пилюли'], ['answers', 'Игрок'], ['waits', 'Ждёт']] // паузы — сразу под этапами: главное для владельца и не прячется под карточкой отрезка

const seg = (v, scale, cls, label, title, onClick, extra = {}) => (
  <button key={v.key} type="button" className={`tlSeg ${cls}`} style={{ left: v.t * scale, width: Math.max(2, (v.end - v.t) * scale) }} title={title} onClick={onClick} {...extra}>{label}</button>
)

export default function TimelineRibbon({ m, pauses, scale, focus = null, selected = null, onPick }) {
  const ref = useRef(null)
  const [view, setView] = useState({ left: 0, width: 1200 })
  const total = Math.max(1, Math.ceil(m.dur * scale))
  const win = windowOf(view.left, view.width, scale)
  useMiddlePan(ref, () => ref.current)

  useLayoutEffect(() => { // ширина окна и прокрутка читаются из контейнера: один слушатель scroll на ленту, обновление — не чаще кадра
    const el = ref.current; if (!el) return undefined
    let raf = 0
    const read = () => { raf = 0; setView(v => { const n = { left: el.scrollLeft, width: Math.max(0, el.clientWidth - LABEL_W) }; return Math.abs(n.left - v.left) < 40 && n.width === v.width ? v : n }) }
    const on = () => { if (!raf) raf = requestAnimationFrame(read) }
    read(); el.addEventListener('scroll', on, { passive: true }); window.addEventListener('resize', on)
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', on); window.removeEventListener('resize', on) }
  }, [])
  useEffect(() => { const el = ref.current; if (el && focus) el.scrollLeft = scrollFor(focus.t, el.clientWidth - LABEL_W, scale) }, [focus, scale])

  const data = useMemo(() => ({
    stages: m.stages, pit: m.lines.filter(l => l.who === 'pit'), mia: m.lines.filter(l => l.who === 'mia'), dictor: m.lines.filter(l => l.who === 'dictor'),
    turns: m.turns.filter(u => !u.demo), answers: m.answers.map(a => ({ ...a, end: a.t, ref: a })),
    waits: [...m.waits.map(w => ({ ...w, kind: 'wait', text: w.why })), ...m.counts.map(c => ({ ...c, kind: 'count', text: 'отсчёт' })), ...m.holds.map(h => ({ ...h, kind: 'hold', text: 'пауза игры' }))].sort((a, b) => a.t - b.t),
    pauses: pauses.filter(p => p.kind === 'dead'),
  }), [m, pauses])
  const pick = (kind, r) => () => onPick?.({ kind, ref: r })
  const on = r => (selected?.ref === r ? ' tlSegOn' : '')
  const many = v => seg(v, scale, 'tlSegMany', v.n > 1 ? `×${v.n}` : '', `${v.n} отрезков — увеличь масштаб`, undefined, { disabled: true })

  const cell = (key, v) => {
    if (!v.item) return many(v)
    const it = v.item
    if (key === 'stages') return seg(v, scale, `tlStage${on(it)}`, stageTitle(it), `${stageTitle(it)} [${it.sid}] — ${dur(it.end - it.t)}`, pick('stage', it), { 'data-type': it.type })
    if (key === 'turns') return seg(v, scale, `tlPill${on(it)}`, it.word, `${it.word}: ${RES[it.res] ?? it.res}`, pick('turn', it), { 'data-res': it.res })
    if (key === 'answers') return seg(v, scale, `tlDot${on(it.ref)}`, '', `${RES[it.res] ?? it.res} ${it.word}`, pick('answer', it.ref), { 'data-res': it.res })
    if (key === 'waits') return seg(v, scale, 'tlWait', it.text, `${it.text} — ${dur(it.end - it.t)}`, pick(it.kind, it), { 'data-kind': it.kind })
    if (key === 'pauses') return seg(v, scale, `tlDead${on(it)}`, it.long ? dur(it.ms) : '', `игра молчит ${dur(it.ms)}`, pick('pause', it), { 'data-long': it.long ? '1' : '0', 'data-testid': it.long ? 'tl-dead-long' : undefined })
    return seg(v, scale, `tlLine${on(it)}`, it.text || it.id, `${WHO[it.who]}: ${it.text || it.id}`, pick('line', it), { 'data-who': it.who, 'data-silent': it.silent ? '1' : undefined })
  }
  const ax = axisTicks(win, scale, m.dur)
  return (
    <div className="tlScroll" ref={ref} data-testid="tl-ribbon">
      <div className="tlCanvas" style={{ width: LABEL_W + total }}>
        <div className="tlRow tlAxis">
          <div className="tlLabel">время</div>
          <div className="tlLane" style={{ width: total }}>{ax.ticks.map(t => <span key={t} className="tlTick" style={{ left: t * scale }}>{clock(t, ax.step < 1000)}</span>)}</div>
        </div>
        {ROWS.map(([key, label]) => (
          <div key={key} className="tlRow" data-row={key}>
            <div className="tlLabel">{label}</div>
            <div className="tlLane" style={{ width: total }}>{visible(data[key], win, scale, undefined, key === 'pauses' ? p => p.long : null).map((v, i) => cell(key, { ...v, key: `${i}:${v.t}` }))}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
