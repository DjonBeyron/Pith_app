import { useState, useEffect, useRef, useCallback } from 'react'
import { getCachedProfile } from '../../shared/api/profileCache.js'
import { markSlowmoHintSeen } from '../../shared/api/profileApi.js'
import { shouldArm, swipeAway } from './slowmoHintPlan.js'

const SEEN_KEY = 'pithy_slowmo_hint_seen_v1'
const IGNORED_KEY = 'pithy_slowmo_hint_ignored_v1' // сколько видео с подсказкой пролистано без неё (между посещениями)
// «Свайп доехал до конца» у виртуализатора не отдельное событие, а вывод из
// activeIdx (см. FeedSwiper.jsx — меняется в начале анимации слайда) — не лезем в его
// внутренности, просто ждём, что activeIdx перестал меняться, плюс
// запрошенные 0.3с сверху: 140 + 300 ≈ 450мс.
const ARM_DELAY_MS = 450

function readSeen() {
  if (getCachedProfile()?.slowmo_hint_seen) return true
  try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
}

function readIgnored() {
  try { return Number(localStorage.getItem(IGNORED_KEY)) || 0 } catch { return 0 }
}

// Обучающая подсказка «зажми лайк — замедли видео» (см. feedSlowZone в
// FeedSlide.jsx). Появляется на 3-м видео ленты при самом первом посещении (slowmoHintPlan.js) и висит на
// следующих, пока ею не воспользуются. Три видео с подсказкой пролистаны без неё (игнор) — подсказка убирается
// насовсем: новичок её не хочет. Счётчик игноров переживает перезапуск приложения (ленту могут бросить на втором
// видео — тогда в следующий раз всё равно 3-е видео). Воспользовался — тоже насовсем. Прячется не по тапу,
// а только когда замедление реально успело подействовать — markSeenNow вызывается из FeedSlide после удержания
// дольше порога.
export function useSlowMotionHint(activeIdx) {
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
    try { localStorage.setItem(SEEN_KEY, '1') } catch { /* нет localStorage — переживём */ }
    if (getCachedProfile()) markSlowmoHintSeen()
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
      const r = swipeAway(readIgnored())
      try { localStorage.setItem(IGNORED_KEY, String(r.ignored)) } catch { /* нет localStorage */ }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- реакция на смену слайда (внешнее событие ленты), а не каскад состояний
      if (r.retire) retire()
      return
    }
    if (shouldArm({ viewed: viewedRef.current, seen })) {
      armTimer.current = setTimeout(() => setArmed(true), ARM_DELAY_MS)
    }
  }, [activeIdx, seen, retire])

  useEffect(() => () => clearTimeout(armTimer.current), [])

  return { showHint: armed && !seen, markSeenNow: retire }
}

// Вызывается один раз сразу после успешной регистрации (RegisterForm.jsx):
// если гость уже видел подсказку локально — переносим флаг на свежий
// серверный профиль, чтобы она не всплыла снова на другом устройстве.
export function transferSlowMotionHintOnRegister() {
  let seenLocally = false
  try { seenLocally = localStorage.getItem(SEEN_KEY) === '1' } catch { /* нет localStorage */ }
  if (seenLocally) markSlowmoHintSeen()
}
