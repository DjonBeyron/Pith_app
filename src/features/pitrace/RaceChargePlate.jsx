import { useEffect, useLayoutEffect, useRef } from 'react'
import { playPlate } from '../player/modules/rotate-phone/wordLanePlateSound.js'
import { MORPH_MS } from './raceOpening.js'

// Плашка этапа, в которую превращается заполненный бар заставки (RaceCharge.jsx, CONCEPT_RACE.md «Бар → плашка»): «Разгон» и под ним задание. Плашка получает ту же рамку, узор и блеск, что у плашек игры (класс .wlTurn, word-lane-plate.css).
// Морф: плашка стоит на своём месте (по центру), а за MORPH_MS (0,6 с) её прямоугольник растёт от прямоугольника бара (его место, ширина, высота и скругление — половина высоты) до размера плашки со скруглением 18 px — бар расширяется
// по высоте и ширине и становится плашкой, углы всё время круглые (border-radius анимируется вместе с размером, а не масштабом, который сплющил бы скругление). Название и задание проявляются ближе к концу морфа; их ширина зафиксирована
// по итоговой, поэтому текст не переносится заново, пока плашка растёт. Размеры меряются один раз до первой отрисовки (useLayoutEffect). На слабом устройстве и при reduced-motion — без роста, плашка просто проявляется (CSS, data-lite).
// На старте морфа играет тот же «блюп», что у плашек игры.
export default function RaceChargePlate({ title, task, barRef }) {
  const ref = useRef(null), body = useRef(null)
  useLayoutEffect(() => {
    const el = ref.current, bar = barRef?.current, host = el?.offsetParent
    if (!el || !bar || !host) return
    const root = host.getBoundingClientRect(), p = el.getBoundingClientRect(), b = bar.getBoundingClientRect()
    const rect = r => ({ top: r.top - root.top, left: r.left - root.left, width: r.width, height: r.height })
    const to = rect(p), from = rect(b)
    if (body.current) body.current.style.width = `${Math.ceil(body.current.getBoundingClientRect().width)}px` // ширина текста — как в итоговой плашке: фиксируется, пока плашка растёт
    Object.assign(el.style, { inset: 'auto', margin: '0', top: `${to.top}px`, left: `${to.left}px`, width: `${to.width}px`, height: `${to.height}px` }) // из центровки .wlTurn — в явные px: их и анимируем
    if (!el.animate || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || el.closest('[data-lite]')) return
    const px = r => ({ top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` })
    el.animate([{ ...px(from), borderRadius: `${from.height / 2}px`, opacity: 0.2 }, { ...px(to), borderRadius: '18px', opacity: 1 }], { duration: MORPH_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'backwards' })
  }, [barRef])
  useEffect(() => { playPlate() }, [])
  return (
    <div ref={ref} className="wlTurn raceChargePlate" data-testid="race-charge-plate">
      <div ref={body} className="raceChargePlateBody">
        <span data-testid="race-charge-title">{title}</span>
        {task && <div className="wlTurnTask" data-testid="race-charge-task">{task}</div>}
      </div>
    </div>
  )
}
