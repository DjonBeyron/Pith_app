import { useLayoutEffect, useRef } from 'react'
import { WIRE_COLORS } from './ladderWires.js'

// Узор под всей вкладкой «Память» (learn-pattern.css): еле заметный, по
// умолчанию нейтральный. Пока есть что повторить (на вкладке горит кнопка
// «Повторить»), от кнопки по узору расходится волна — синхронно со вспышкой её
// обводок. Цвет волны — цвет точек, что бегут от ступени к кнопке: у кого из
// ступеней есть слова на сегодня (небесная / салатовая / золотистая); слова из нескольких
// ступеней — цвета по очереди, по волне на цикл. Закрепление фразы — золотая.
const PHRASE_COLOR = '#ffd257'

export default function LearnPattern({ view, ladder }) {
  const ref = useRef(null)
  const show = !!view && !view.vacation && !view.empty && (view.today.picked.length > 0 || !!view.today.phrase)
  let colors = []
  if (show) {
    colors = view.today.picked.length
      ? (ladder?.levels ?? []).map((l, i) => (l.words.some(w => w.today) ? WIRE_COLORS.levels[i] : null)).filter(Boolean)
      : [PHRASE_COLOR]
  }

  // Центр волны — центр кнопки «Повторить» (в координатах корня вкладки)
  useLayoutEffect(() => {
    const root = ref.current?.parentElement
    const btn = root?.querySelector('.lrCta')
    if (!btn) return
    const a = root.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    ref.current.style.setProperty('--wx', `${Math.round(b.left + b.width / 2 - a.left)}px`)
    ref.current.style.setProperty('--wy', `${Math.round(b.top + b.height / 2 - a.top)}px`)
  })

  const n = Math.min(3, colors.length)
  return (
    <div className="lrPattern" ref={ref} aria-hidden="true">
      {n > 0 && (
        <div className="lrPatternWave">
          <i className={`lrWave lrWave--n${n}`}
            style={{ '--c0': colors[0], '--c1': colors[1] ?? colors[0], '--c2': colors[2] ?? colors[0] }} />
        </div>
      )}
    </div>
  )
}
