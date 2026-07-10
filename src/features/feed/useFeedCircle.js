import { useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { fdbg } from '../../shared/lib/feedDebug.js'

// Бесконечный круг ленты: виртуализация TanStack + тихая перецентровка
// scrollTop (teleport) + активный слайд из позиции скролла.
export function useFeedCircle(len) {
  // Активный слайд считается из позиции скролла (не IntersectionObserver —
  // тот в webview-средах может молчать, и видео не монтировалось)
  const [activeIdx, setActiveIdx] = useState(-1)
  const scrollRef = useRef(null)

  // Запас: минимум 40 циклов. Snap-stop пускает по слайду за жест, поэтому
  // между перецентровками до реального края долистать нельзя.
  // При маленьком len (мало модулей) перецентровка (teleport) раньше
  // случалась через каждые ~len*3 слайдов — а она пересоздаёт DOM-узел
  // активного <video> (новый ключ виртуализатора), что на iOS Safari рвёт
  // разрешение на автовоспроизведение со звуком у свежего элемента (см.
  // fdbg 'sound blocked' сразу за 'teleport settle' в реальном логе).
  // Больший запас циклов не стоит ничего в DOM (рендерится только overscan),
  // зато отодвигает перецентровку на порядок дальше — звук перестаёт рваться
  // при обычном пролистывании
  const cycles = len > 0 ? Math.max(40, Math.ceil(120 / len)) : 0
  const settleTimer = useRef(null)

  // Высота вьюпорта ленты — размер каждого виртуального слайда
  const [viewH, setViewH] = useState(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = () => {
      fdbg('viewH:', el.clientHeight)
      setViewH(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [len])

  // Виртуализация как в TikTok: в DOM живут только видимый слайд и запас
  // overscan сверху/снизу. Пока высота экрана не измерена (viewH=0) — список
  // пуст: рендер по «прикидочной» высоте с последующей перестройкой давал
  // мигание нескольких слайдов при старте
  const virtualizer = useVirtualizer({
    count: len > 0 && viewH > 0 ? cycles * len : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => viewH || 1,
    overscan: 2,
  })
  useEffect(() => { virtualizer.measure() }, [viewH]) // eslint-disable-line react-hooks/exhaustive-deps

  // Телепорт scrollTop с ВЫКЛЮЧЕННЫМ snap: iOS Safari на программный
  // scrollTop в snap-контейнере запускает «доснэпливание» и скролл улетает
  // к краям — получалась вечная драка (мигание слайдов). События скролла от
  // самого телепорта глушим флагом
  const teleportingRef = useRef(false)
  function teleport(el, target, why) {
    fdbg('teleport', why + ':', el.scrollTop.toFixed(0), '→', target.toFixed(0))
    teleportingRef.current = true
    const prev = el.style.scrollSnapType
    el.style.scrollSnapType = 'none'
    el.scrollTop = target
    if (viewH > 0) setActiveIdx(Math.round(target / viewH))
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.scrollSnapType = prev
      teleportingRef.current = false
    }))
  }

  // Перенос в середину круга с сохранением позиции внутри цикла: контент в
  // точке переноса идентичен, поэтому скачка не видно
  function recentre(why) {
    const el = scrollRef.current
    if (!el || !len) return
    const cycleH = el.scrollHeight / cycles
    const target = Math.floor(cycles / 2) * cycleH + (el.scrollTop % cycleH)
    if (Math.abs(target - el.scrollTop) > 1) teleport(el, target, why)
  }

  // Старт с середины круга — один раз, когда известны список и высота
  // экрана И контейнер реально растянут (iOS обрезал scrollTop, если ставить
  // его раньше, чем виртуализатор дорастил высоту)
  const initedRef = useRef(false)
  useEffect(() => { initedRef.current = false }, [len])
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !len || !viewH || initedRef.current) return
    initedRef.current = true
    const want = cycles * len * viewH
    let tries = 0
    const apply = () => {
      if (!scrollRef.current) return
      if (scrollRef.current.scrollHeight >= want - 2 || tries++ > 60) {
        teleport(scrollRef.current, len * viewH * Math.floor(cycles / 2), 'init')
      } else {
        requestAnimationFrame(apply)
      }
    }
    apply()
  }, [len, cycles, viewH])

  useEffect(() => () => clearTimeout(settleTimer.current), [])

  // Доводка: скролл остановился — только перецентровка круга, если додрейфовали
  // к краю запаса (teleport). Активный слайд считается в onScroll на лету.
  function onSettle() {
    const el = scrollRef.current
    if (!el || !len) return
    el.dataset.scrolling = '' // скролл затих — сторож стоп-кадра снова работает
    const cycleH = el.scrollHeight / cycles
    const mid = Math.floor(cycles / 2) * cycleH
    const threshold = cycleH * Math.max(1, Math.floor(cycles / 2) - 2)
    if (Math.abs(el.scrollTop - mid) > threshold) recentre('settle')
  }

  function onScroll() {
    const el = scrollRef.current
    if (!el || !len) return
    // Активный слайд — сразу из позиции скролла. Сосед (active±1) при этом
    // считается near и заранее прогревает своё видео из пула, поэтому при
    // приезде оно стартует мгновенно (см. SlideVideo/videoPool).
    if (viewH > 0) setActiveIdx(Math.round(el.scrollTop / viewH))
    // События, порождённые нашим же телепортом, не обрабатываем
    if (teleportingRef.current) return
    // Флаг для сторожа стоп-кадра (SlideVideo): во время свайпа не пинать
    el.dataset.scrolling = '1'
    clearTimeout(settleTimer.current)
    settleTimer.current = setTimeout(onSettle, 140)
    // Аварийный перенос прямо в полёте — лишь у самого края
    const cycleH = el.scrollHeight / cycles
    const maxTop = el.scrollHeight - el.clientHeight
    if (el.scrollTop < cycleH * 0.5 || el.scrollTop > maxTop - cycleH * 0.5) recentre('edge')
  }

  return { scrollRef, virtualizer, viewH, cycles, activeIdx, onScroll }
}
