import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import SceneTaskSheet from './SceneTaskSheet.jsx'

// Накрытие панели «О чём диалог» у нижней навигации — тот же механизм и те же классы, что у накрытия «Ловли слов»
// (feed-catch.css: .catchCover выезжает transform'ом 260мс, содержимое проявляется через заливку .catchCoverVeil):
// монтируется спрятанным, кадром позже получает .catchCoverShown; уход — класс снят, по transitionend transform зовётся
// onClosed (родитель размонтирует; страховка — таймер в useSceneTask). Содержимое на время ухода заморожено (useFrozenPhase). Без React-состояния на высоту: высота блока из
// ResizeObserver кладётся в --catch-cover-h ближайшего .feedSlide (иконка паузы и чипы звука уезжают вверх, как при «Ловле»),
// и на слайд ставится data-scene-task — блок фразы под панелью гаснет (feed-scene-task.css). Клики внутри не всплывают
// к слою сцены (там тап = пауза/пуск). children — своё тело вместо клавиатурной шторки (голосовая панель, SceneTaskPanel.jsx).
export default function SceneTaskCover({ open, onClosed, children = null, ...sheet }) {
  const ref = useRef(null)
  const [ticked, setTicked] = useState(false)
  if (!open && ticked) setTicked(false)
  useEffect(() => {
    if (!open) return undefined
    const id = requestAnimationFrame(() => setTicked(true))
    return () => cancelAnimationFrame(id)
  }, [open])
  const shown = open && ticked
  const [settled, setSettled] = useState(false)
  function onTransitionEnd(e) {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return
    setSettled(shown)
    if (!open) onClosed?.()
  }
  const closedRef = useRef(onClosed)
  useEffect(() => { closedRef.current = onClosed })
  useEffect(() => {
    if (open || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    const t = setTimeout(() => closedRef.current?.(), 0)
    return () => clearTimeout(t)
  }, [open])

  // Пока панель открыта: высота блока → --catch-cover-h слайда, на слайд — data-scene-task. СНЯТИЕ (переменная в 0, атрибут) — НЕ в начале ухода,
  // а когда панель уже уехала (размонтирование, эффект ниже): иначе во время 260-мс анимации ухода шёл бы пересчёт стилей слайда (гаснущие/
  // проявляющиеся блок фразы, иконка паузы, чипы звука) и рваный кадр на слабом телефоне. Под панелью эти слои и так скрыты атрибутом
  useLayoutEffect(() => {
    const el = ref.current
    const slide = el?.closest('.feedSlide')
    if (!el || !slide || !shown) return undefined
    slide.style.setProperty('--catch-icon-ms', '260ms')
    slide.setAttribute('data-scene-task', '1')
    let last = -1
    const report = () => {
      const h = Math.round(el.getBoundingClientRect().height)
      if (h !== last) { last = h; slide.style.setProperty('--catch-cover-h', `${h}px`) }
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect() // уход начался: высота и атрибут остаются до конца анимации
  }, [shown])
  useLayoutEffect(() => {
    const slide = ref.current?.closest('.feedSlide')
    return () => {
      if (!slide) return
      slide.style.setProperty('--catch-icon-ms', '0ms') // слои под панелью скрыты атрибутом: на место встают без скольжения
      slide.style.setProperty('--catch-cover-h', '0px')
      slide.removeAttribute('data-scene-task')
    }
  }, [])

  return (
    <div
      className={`catchCover stCover${shown ? ' catchCoverShown' : ''}${shown !== settled ? ' catchCoverMoving' : ''}`}
      ref={ref} onTransitionEnd={onTransitionEnd} onClick={e => e.stopPropagation()}
    >
      {children ?? <SceneTaskSheet {...sheet} />}
      <i className="catchCoverVeil" aria-hidden="true" />
    </div>
  )
}
