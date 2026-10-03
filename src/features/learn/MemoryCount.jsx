import { useState, useRef, useLayoutEffect, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { plural } from '../../shared/lib/plural.js'
import { popPlace, ORBIT_RX } from './memoryCountPop.js'
import { WIRE_COLORS } from './ladderWires.js'

// Счётчик слов во временной памяти — справа от первой ступени: только число.
// Число «дышит» цветами ступеней (небесный → салатовый → золотистый, каждый
// загорается и медленно тускнеет — три копии числа, у каждой своя фаза, меняется
// только opacity). Вокруг него, как электроны вокруг ядра, тесно летят три точки
// цветов ступеней (когда слов больше нуля; при 0 — только число) по трём пересекающимся орбитам (эллипс 24×8 px, повёрнут на
// 0° / 60° / 120°); сами орбиты видны тонкими бледными линиями. Точка едет
// двумя transform-анимациями — по x и по y со сдвигом на четверть круга
// (эллипс без offset-path: всё на компоситоре, страница не перерисовывается).
// Орбиты центрированы на числе и растут вместе с ним: ширина числа — от левого
// края первой цифры до правого края последней (--k в CSS: 1 для одной цифры,
// больше для двух-трёх; не шире кнопки). Линии орбит почти невидимы (1%).
// Тап по числу — окошко: что это за счётчик и как слова сюда попадают, тремя
// короткими блоками без номеров. Окно строго по центру экрана, верх чуть ниже числа, на верхней кромке — уголок, что
// смотрит на число (memoryCountPop.js; точки на орбитах остаются видны); экран под ним затемнён так же, как при
// разблокировке урока в схеме модуля (.lessonLockedOverlay). Окошко — в портале (body): иначе ступень-предок
// держит его под пятиугольником ниже по странице; появляется с тем же «колебанием», что панель сложности в
// ленте, а при закрытии окно схлопывается в кончик уголка, и в такт с масштабом поверх
// текста проступает заливка цветом фона окна (opacity слоя-заливки), а затемнение тает (CLOSE_MS).
const ORBITS = [
  { deg: 0, dur: 3.2, color: WIRE_COLORS.levels[0] },
  { deg: 60, dur: 4.1, color: WIRE_COLORS.levels[1] },
  { deg: 120, dur: 5, color: WIRE_COLORS.levels[2] },
]

const CLOSE_MS = 340 // схлопывание и заливка идут вместе, 0.34 с

export default function MemoryCount({ total }) {
  const [pop, setPop] = useState(null) // место окошка (popPlace) — оно открыто
  const [closing, setClosing] = useState(false)
  const btnRef = useRef(null)
  const numRef = useRef(null)
  const words = `${total} ${plural(total, 'слово', 'слова', 'слов')} во временной памяти`

  // Масштаб орбит по ширине числа (0 → 1 цифра: 18 px, 3 цифры ≈ 54 px)
  useLayoutEffect(() => {
    const btn = btnRef.current
    const w = numRef.current?.getBoundingClientRect().width || 18
    const maxK = Math.max(1, ((btn?.clientWidth ?? 86) / 2 - 4) / ORBIT_RX)
    btn?.style.setProperty('--k', String(Math.min(maxK, Math.max(1, (w / 2 + 14) / ORBIT_RX)).toFixed(3)))
  }, [total])

  // Закрыть: окошко схлопывается, а заливка фона в такт закрывает текст (класс --out), потом уходит из разметки; при
  // «уменьшить движение» — сразу
  function close() {
    if (closing) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setPop(null); return }
    setClosing(true)
    setTimeout(() => { setPop(null); setClosing(false) }, CLOSE_MS)
  }

  // Окошко ставится по центру экрана, уголком к цифре (popPlace)
  function open() {
    const btn = btnRef.current
    if (!btn) return
    const k = parseFloat(btn.style.getPropertyValue('--k')) || 1
    setPop(popPlace({ rect: btn.getBoundingClientRect(), vw: document.documentElement.clientWidth, k }))
  }

  // Размер окна браузера изменился — место окошка устарело, закрываем
  useEffect(() => {
    if (!pop) return
    const off = () => setPop(null)
    window.addEventListener('resize', off)
    return () => window.removeEventListener('resize', off)
  }, [pop])

  return (
    <div className="memCountWrap">
      <button ref={btnRef} className="memCount" onClick={open} aria-label={`${words}. Подробнее`}>
        {/* Слов нет (0) — три точки не летают: орбитам нечего окружать */}
        {total > 0 && (
          <>
            <svg className="memOrbitLines" viewBox="-30 -30 60 60" aria-hidden="true">
              {ORBITS.map(o => <ellipse key={o.deg} rx="24" ry="8" transform={`rotate(${o.deg})`} stroke={o.color} />)}
            </svg>
            {ORBITS.map(o => (
              <span key={o.deg} className="memOrbit" style={{ transform: `rotate(${o.deg}deg)`, color: o.color, '--dur': `${o.dur}s` }} aria-hidden="true">
                <span className="memOrbitX"><span className="memOrbitY"><i /></span></span>
              </span>
            ))}
          </>
        )}
        <b ref={numRef} className="memCountNum memCountNum--ghost" aria-hidden="true">{total}</b>
        {[1, 2, 3].map(n => <b key={n} className={`memCountNum memCountNum--${n}`} aria-hidden="true">{total}</b>)}
      </button>
      {pop && createPortal(
        <div className={`memCountBack${closing ? ' memCountBack--out' : ''}`} onClick={close}>
          <div className={`memCountPop${closing ? ' memCountPop--out' : ''}`} role="dialog" aria-label="Временная память"
            style={{ top: pop.top, left: pop.left, width: pop.width, '--caret-x': `${pop.caretX}px`, transformOrigin: `${pop.caretX}px -8px` }}
            onClick={e => e.stopPropagation()}>
            <p className="memCountPopTitle">Временная память</p>
            <p className="memCountPopLead">Здесь слова, которые тебе попадались в уроках</p>
            <ul className="memCountSteps">
              <li className="memCountStep memCountStep--1">Слова из урока попадают<br /><b>в этот счётчик</b></li>
              <li className="memCountStep memCountStep--2">Чтобы запомнить их навсегда, нужно<br /><b>повторить их несколько раз</b></li>
              <li className="memCountStep memCountStep--3">После этого слова попадают в <b>постоянную память</b>, где ты их точно не забудешь</li>
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
