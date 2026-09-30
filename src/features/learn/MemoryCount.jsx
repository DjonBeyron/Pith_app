import { useState, useRef } from 'react'
import { plural } from '../../shared/lib/plural.js'

// Счётчик слов во временной памяти — справа от первой ступени: только число.
// Число «дышит» цветами ступеней (серый → жёлтый → салатовый, каждый
// загорается и медленно тускнеет — три копии числа, у каждой своя фаза, меняется
// только opacity), вокруг него по трём пересекающимся орбитам летят три точки
// цветов ступеней — как электроны в атоме (offset-path, три точки 5 px, без
// фильтров и размытия). Тап по числу — окошко: что это за счётчик и как слова
// сюда попадают; появляется с тем же «колебанием», что панель сложности в ленте.
const ORBITS = [
  { deg: 0, dur: 3.6, color: '#b0b8c2' },
  { deg: 60, dur: 4.5, color: '#e2cd78' },
  { deg: 120, dur: 5.4, color: '#b6fe3b' },
]

export default function MemoryCount({ total }) {
  const [pop, setPop] = useState(null) // { top } — окошко открыто
  const btnRef = useRef(null)
  const words = `${total} ${plural(total, 'слово', 'слова', 'слов')} во временной памяти`

  function open() {
    const r = btnRef.current?.getBoundingClientRect()
    setPop({ top: Math.round((r?.bottom ?? 120) + 4) })
  }

  return (
    <div className="memCountWrap">
      <button ref={btnRef} className="memCount" onClick={open} aria-label={`${words}. Подробнее`}>
        {ORBITS.map(o => (
          <span key={o.deg} className="memOrbit" style={{ transform: `rotate(${o.deg}deg)` }} aria-hidden="true">
            <span className="memOrbitDot" style={{ color: o.color, '--dur': `${o.dur}s` }}><i /></span>
          </span>
        ))}
        <b className="memCountNum memCountNum--ghost" aria-hidden="true">{total}</b>
        {[1, 2, 3].map(n => <b key={n} className={`memCountNum memCountNum--${n}`} aria-hidden="true">{total}</b>)}
      </button>
      {pop && (
        <div className="memCountBack" onClick={() => setPop(null)}>
          <div className="memCountPop" role="dialog" aria-label="Слова во временной памяти" style={{ top: pop.top }} onClick={e => e.stopPropagation()}>
            <p className="memCountPopTitle">{words}</p>
            <p className="memCountPopText">
              Здесь слова, которые ты ещё запоминаешь. Слово попадает сюда после урока, и мы напоминаем о нём вовремя: завтра, через неделю, через месяц.
              Когда слово запомнится, оно перейдёт в постоянную память — навсегда.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
