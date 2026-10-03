import { useState, useEffect, useRef, useCallback } from 'react'
import { shouldArm, swipeAway, MAX_IGNORED } from './slowmoHintPlan.js'

// «Свайп доехал до конца» у виртуализатора не отдельное событие, а вывод из
// activeIdx (см. FeedSwiper.jsx — меняется в начале анимации слайда) — не лезем в его
// внутренности, просто ждём, что activeIdx перестал меняться, плюс
// запрошенные 0.3с сверху: 140 + 300 ≈ 450мс.
const ARM_DELAY_MS = 450

// Обучающая подсказка ленты (общая часть: «зажми — замедли», «потри фразу»). Появляется на armAt-м видео при первом
// посещении (slowmoHintPlan.js) и висит на следующих, пока ею не воспользуются. maxIgnored видео с подсказкой пролистаны
// без неё (игнор) — подсказка убирается насовсем: новичок её не хочет. Счётчик игноров переживает перезапуск приложения
// (ленту могут бросить на втором видео — тогда в следующий раз всё равно armAt-е видео). Воспользовался — тоже насовсем.
// cfg: { seenKey, ignoredKey, armAt, maxIgnored?, serverSeen?: () => bool, onRetire?: () => void } — ключи localStorage и
// (для подсказки замедления) флаг в профиле: уже видел на другом устройстве / запомнить на сервере.
// → { showHint, markSeenNow } — markSeenNow зовут, когда подсказкой реально воспользовались
export function useFeedHint(activeIdx, cfg) {
  const { seenKey, ignoredKey, armAt, maxIgnored = MAX_IGNORED } = cfg
  const cfgRef = useRef(cfg)
  useEffect(() => { cfgRef.current = cfg })
  const readSeen = () => {
    if (cfg.serverSeen?.()) return true
    try { return localStorage.getItem(seenKey) === '1' } catch { return false }
  }
  const readIgnored = () => {
    try { return Number(localStorage.getItem(ignoredKey)) || 0 } catch { return 0 }
  }

  const [seen, setSeen] = useState(readSeen)
  const [armed, setArmed] = useState(false)
  const viewedRef = useRef(0) // видео, показанных в этом посещении ленты
  const armedRef = useRef(false)
  const prevIdxRef = useRef(activeIdx)
  const armTimer = useRef(null)

  useEffect(() => { armedRef.current = armed })

  // Убрать насовсем: воспользовались или проигнорировали трижды
  const retire = useCallback(() => {
    clearTimeout(armTimer.current) // отменяем отложенный показ, если он ещё не выстрелил
    setSeen(true)
    setArmed(false)
    try { localStorage.setItem(cfgRef.current.seenKey, '1') } catch { /* нет localStorage — переживём */ }
    cfgRef.current.onRetire?.()
  }, [])

  useEffect(() => {
    if (activeIdx === prevIdxRef.current) return
    prevIdxRef.current = activeIdx
    // Свайп ещё в движении (activeIdx снова поменялся) — сбрасываем
    // таймер и ждём следующей остановки, не показываем на полпути
    clearTimeout(armTimer.current)
    if (activeIdx < 0) return
    viewedRef.current += 1
    if (seen) return
    if (armedRef.current) {
      // Ушли с видео, на котором висела подсказка, не воспользовавшись ею
      const r = swipeAway(readIgnored(), maxIgnored)
      try { localStorage.setItem(ignoredKey, String(r.ignored)) } catch { /* нет localStorage */ }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- реакция на смену слайда (внешнее событие ленты), а не каскад состояний
      if (r.retire) retire()
      return
    }
    if (shouldArm({ viewed: viewedRef.current, seen }, armAt)) {
      armTimer.current = setTimeout(() => setArmed(true), ARM_DELAY_MS)
    }
  }, [activeIdx, seen, retire]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clearTimeout(armTimer.current), [])

  return { showHint: armed && !seen, markSeenNow: retire }
}
