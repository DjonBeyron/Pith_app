import { useState, useRef } from 'react'
import { plural } from '../../shared/lib/plural.js'

// Счётчик слов во временной памяти — справа от первой ступени: только число.
// Число «дышит» цветами ступеней (серый → жёлтый → салатовый, каждый
// загорается и медленно тускнеет — три копии числа, у каждой своя фаза, меняется
// только opacity). Вокруг него, как электроны вокруг ядра, тесно летят три точки
// цветов ступеней по трём пересекающимся орбитам (эллипс 24×8 px, повёрнут на
// 0° / 60° / 120°); сами орбиты видны тонкими бледными линиями. Точка едет
// двумя transform-анимациями — по x и по y со сдвигом на четверть круга
// (эллипс без offset-path: всё на компоситоре, страница не перерисовывается).
// Тап по числу — окошко: что это за счётчик и как слова сюда попадают;
// появляется с тем же «колебанием», что панель сложности в ленте, а при закрытии
// так же плавно схлопывается (CLOSE_MS), а не пропадает разом.
const ORBITS = [
  { deg: 0, dur: 3.2, color: '#b0b8c2' },
  { deg: 60, dur: 4.1, color: '#e2cd78' },
  { deg: 120, dur: 5, color: '#b6fe3b' },
]

const CLOSE_MS = 200

export default function MemoryCount({ total }) {
  const [pop, setPop] = useState(null) // { top } — окошко открыто
  const [closing, setClosing] = useState(false)
  const btnRef = useRef(null)
  const words = `${total} ${plural(total, 'слово', 'слова', 'слов')} во временной памяти`

  // Закрыть: окошко схлопывается (класс --out), потом уходит из разметки; при
  // «уменьшить движение» — сразу
  function close() {
    if (closing) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPop(null); return }
    setClosing(true)
    setTimeout(() => { setPop(null); setClosing(false) }, CLOSE_MS)
  }

  function open() {
    const r = btnRef.current?.getBoundingClientRect()
    setPop({ top: Math.round((r?.bottom ?? 120) + 4) })
  }

  return (
    <div className="memCountWrap">
      <button ref={btnRef} className="memCount" onClick={open} aria-label={`${words}. Подробнее`}>
        <svg className="memOrbitLines" viewBox="-30 -30 60 60" aria-hidden="true">
          {ORBITS.map(o => <ellipse key={o.deg} rx="24" ry="8" transform={`rotate(${o.deg})`} stroke={o.color} />)}
        </svg>
        {ORBITS.map(o => (
          <span key={o.deg} className="memOrbit" style={{ transform: `rotate(${o.deg}deg)`, color: o.color, '--dur': `${o.dur}s` }} aria-hidden="true">
            <span className="memOrbitX"><span className="memOrbitY"><i /></span></span>
          </span>
        ))}
        <b className="memCountNum memCountNum--ghost" aria-hidden="true">{total}</b>
        {[1, 2, 3].map(n => <b key={n} className={`memCountNum memCountNum--${n}`} aria-hidden="true">{total}</b>)}
      </button>
      {pop && (
        <div className="memCountBack" onClick={close}>
          <div className={closing ? 'memCountPop memCountPop--out' : 'memCountPop'} role="dialog" aria-label="Слова во временной памяти" style={{ top: pop.top }} onClick={e => e.stopPropagation()}>
            <p className="memCountPopTitle">{words}</p>
            <p className="memCountPopText">
              Здесь слова, которые ты ещё запоминаешь. Слово попадает сюда после урока, и мы напоминаем о нём вовремя:{' '}
              <b className="memAcc memAcc--1">завтра</b>, <b className="memAcc memAcc--2">через неделю</b>, <b className="memAcc memAcc--3">через месяц</b>.
              Когда слово запомнится, оно перейдёт в постоянную память — навсегда.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
