import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'

// Бокс нода в координатах контейнера — ПО РАСКЛАДКЕ (offsetLeft/offsetTop по
// цепочке offsetParent до контейнера), а не getBoundingClientRect: тот отдаёт
// рект с учётом transform-анимаций. Пульс Старта после диагностики
// (mgNodePulse, scale(1.03) обёртки .mgGlow) растягивал его рект на ~5px, и
// пересчёт линий, попавший в эти 0.9с (подъехал прогресс/звёзды, сменилась
// высота карточки), рисовал линию от сдвинутой точки — и так оставлял.
function layoutBox(el, cont) {
  let x = 0, y = 0
  for (let n = el; n && n !== cont; n = n.offsetParent) {
    x += n.offsetLeft
    y += n.offsetTop
    const p = n.offsetParent
    if (p && p !== cont) { x += p.clientLeft; y += p.clientTop }
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight }
}

// Геометрия линий графа модуля: меряет раскладку нодов и строит SVG-пути
// (левые старт→урок с точками, правые урок→финал со стрелкой и частичным
// зелёным заполнением). Пересчёт — синхронно после каждого коммита (до
// отрисовки кадра) и при каждом ресайзе контейнера. Возвращает массив arcs
// для ChainLines/XpFlight.
export function useChainArcs({ containerRef, startRef, finalRef, lessonRefs }) {
  const [arcs, setArcs] = useState([])
  // true после первого УСПЕШНОГО замера (не сбрасывается обратно) — ModuleGraph
  // держит схему невидимой (opacity, без смены layout/измерений), пока линии
  // не посчитаны ни разу: раньше узлы появлялись, а линии — кадром позже.
  const [ready, setReady] = useState(false)
  // Снимок последних дуг: тот же результат — без setState (замер идёт после
  // каждого коммита, иначе он сам бы порождал бесконечные ре-рендеры)
  const lastKey = useRef('')

  const drawLines = useCallback(() => {
    const cont = containerRef.current
    if (!cont || !startRef.current || !finalRef.current) return

    const mid = (el, side) => {
      const b = layoutBox(el, cont)
      return side === 'left'
        ? { x: b.x, y: b.y + b.h / 2 }
        : { x: b.x + b.w, y: b.y + b.h / 2 }
    }

    const pTop    = mid(startRef.current, 'left')
    const pBottom = mid(finalRef.current, 'right')

    const cw = cont.offsetWidth
    const leftSpace  = Math.min(pTop.x,    ...lessonRefs.current.filter(Boolean).map(el => mid(el,'left').x))
    const rightSpace = cw - Math.max(pBottom.x, ...lessonRefs.current.filter(Boolean).map(el => mid(el,'right').x))
    // Правый изгиб уже левого (26 против 40) и жёстко клэмпится к cw - 10:
    // на узких экранах (iPhone SE) ствол со стрелкой не уходит за край экрана,
    // держится ближе к урокам.
    const offL = Math.max(10, Math.min(40, leftSpace  - 6))
    const offR = Math.max(10, Math.min(26, rightSpace - 6))
    const clampR = (mx) => Math.min(mx, cw - 10)

    const orthPath = (x1, y1, x2, y2, isLeft) => {
      const off = isLeft ? offL : offR
      const r = Math.min(15, Math.abs(y2 - y1) / 2)
      const d = y2 > y1 ? 1 : -1
      if (isLeft) {
        const mx = Math.min(x1, x2) - off
        return `M ${x1} ${y1} L ${mx+r} ${y1} Q ${mx} ${y1} ${mx} ${y1+r*d} L ${mx} ${y2-r*d} Q ${mx} ${y2} ${mx+r} ${y2} L ${x2} ${y2}`
      } else {
        const mx = clampR(Math.max(x1, x2) + off)
        return `M ${x1} ${y1} L ${mx-r} ${y1} Q ${mx} ${y1} ${mx} ${y1+r*d} L ${mx} ${y2-r*d} Q ${mx} ${y2} ${mx-r} ${y2} L ${x2} ${y2}`
      }
    }

    // Частичный правый путь: от урока до развилки следующего урока на общем стволе.
    const rightPartial = (x1, y1, stopY) => {
      const mx = clampR(Math.max(x1, pBottom.x) + offR)
      const r = Math.min(15, Math.abs(pBottom.y - y1) / 2)
      const dir = pBottom.y > y1 ? 1 : -1
      return `M ${x1} ${y1} L ${mx - r} ${y1} Q ${mx} ${y1} ${mx} ${y1 + r * dir} L ${mx} ${stopY}`
    }

    const newArcs = []
    lessonRefs.current.forEach((el, i) => {
      if (!el) return
      const pL = mid(el, 'left')
      const pR = mid(el, 'right')
      // Слева (старт → урок): зелёная линия с точками на концах, без стрелки.
      newArcs.push({
        d: orthPath(pTop.x, pTop.y, pL.x, pL.y, true),
        side: 'left',
        dots: [{ x: pTop.x, y: pTop.y }, { x: pL.x, y: pL.y }],
      })
      // Справа (урок → финал): серая линия со стрелкой + зелёное заполнение
      // до развилки следующего урока (у последнего — до самого финала).
      // Точка на выходе из урока — как у левых линий на входе.
      const fullD  = orthPath(pR.x, pR.y, pBottom.x, pBottom.y, false)
      const nextEl = lessonRefs.current[i + 1]
      const fillD  = nextEl ? rightPartial(pR.x, pR.y, mid(nextEl, 'right').y) : fullD
      newArcs.push({
        d: fullD, side: 'right', arrow: true, fillD, lessonIndex: i,
        dots: [{ x: pR.x, y: pR.y }],
      })
    })
    const key = JSON.stringify(newArcs)
    if (key === lastKey.current) return
    lastKey.current = key
    setArcs(newArcs)
    setReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // После КАЖДОГО коммита, до кадра: снятие замка (появилась награда), прогресс,
  // звёзды, сила памяти меняют высоту карточек прямо в этом рендере — линии
  // переезжают в том же кадре, что и ноды. Раньше это ловил ResizeObserver →
  // rAF → setState: ноды уже сдвинулись, линии догоняли на 1–2 кадра позже —
  // и выглядело как «дёрганье» линий при разблокировании
  useLayoutEffect(drawLines)

  // Ресайз контейнера не из React (поворот экрана, шрифты) — по кадру
  useEffect(() => {
    const ro = new ResizeObserver(() => requestAnimationFrame(drawLines))
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [drawLines]) // eslint-disable-line react-hooks/exhaustive-deps

  return { arcs, ready }
}
