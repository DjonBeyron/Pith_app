import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { miniRect, scrollFromMini } from '../timelineView.js'
import { clock } from '../timelineFormat.js'

// Мини-карта монтажа: вся игра узкой полосой — этапы цветом, красные метки долгих пауз «игра молчит», указатель и прямоугольник видимого окна. Нажатие или перетаскивание ставит окно в это место.
// Узлов немного: этапы (десятки) и долгие паузы; на длинной игре метки уже 1 px не рисуются чаще, чем раз в 2 px.
export default function MontageMinimap({ mont, view, scale, ph, onLeft }) {
  const ref = useRef(null)
  const [w, setW] = useState(800)
  useLayoutEffect(() => { const read = () => setW(ref.current?.clientWidth || 800); read(); window.addEventListener('resize', read); return () => window.removeEventListener('resize', read) }, [])
  const k = w / Math.max(1, mont.dur), rect = miniRect(view.left, view.width, scale, mont.dur, w)
  const go = e => { const r = ref.current.getBoundingClientRect(); onLeft(scrollFromMini(e.clientX - r.left, r.width, mont.dur, scale, view.width)) }
  const down = e => {
    e.preventDefault(); go(e)
    const up = () => { window.removeEventListener('pointermove', go); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
    window.addEventListener('pointermove', go); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }
  const marks = useMemo(() => mont.gaps.filter(g => g.long).reduce((r, g) => (r.length && (g.t - r[r.length - 1].t) * k < 2 ? r : [...r, g]), []), [mont, k]) // метки не чаще, чем раз в 2 px
  return (
    <div className="mtgMini" ref={ref} onPointerDown={down} data-testid="mtg-mini" title="Вся игра: нажми или тяни — окно встанет сюда">
      {mont.stages.map(s => <i key={s.t} className="mtgMiniStage" data-act={s.act} data-type={s.type} style={{ left: s.t * k, width: Math.max(1, (s.end - s.t) * k) }} />)}
      {marks.map(g => <i key={g.t} className="mtgMiniDead" style={{ left: g.t * k, width: Math.max(2, g.ms * k) }} />)}
      <i className="mtgMiniPh" style={{ left: ph * k }} />
      <i className="mtgMiniWin" style={{ left: rect.x, width: rect.w }} data-testid="mtg-mini-win" />
      <span className="mtgMiniEnd">{clock(mont.dur)}</span>
    </div>
  )
}
