import { useState, useEffect, useRef } from 'react'
import { leaseVideo } from './videoPool.js'
import { track } from '../../shared/lib/analytics/track.js'
import { FEED_SLOW } from '../../shared/lib/analytics/eventNames.js'

// Замедленное воспроизведение 0.5x: держим палец в зоне (feedSlowZone) —
// playbackRate уходит на 0.5, preservesPitch сам держит высоту голоса
// нормальной; отпустили — обратно на 1x. Доступно только при включённом
// звуке — без него эффект не слышен и бессмысленен. Общий для ленты
// (FeedSlide) и «Моих уроков» (MyLessonSlide) — оба держат видео в одном
// пуле (videoPool) под своим slideKey. Зоны две: над лайком (feedSlowZone) и правая полоса в «Ловле слов» (FeedSlowStrip).
// modId — только для аналитики (feed_slow: зажал/отпустил); null — не пишем
export function useSlowMotion(slideKey, active, soundOn, modId = null) {
  const [slowMotion, setSlowMotion] = useState(false)
  const onRef = useRef(false) // замедление реально включено (ref: отпускание без удержания событие не пишет)

  // e — событие pointerdown зоны; null — зовёт по таймеру удержания правая полоса «Ловли» (FeedSlowStrip), которая сама
  // уже захватила указатель
  function startSlowMotion(e) {
    if (!active || !soundOn) return
    if (e) {
      e.preventDefault()
      try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* не критично */ }
    }
    const v = leaseVideo(slideKey)
    v.playbackRate = 0.5
    v.preservesPitch = true
    v.webkitPreservesPitch = true
    if (!onRef.current && modId) track(FEED_SLOW, { module_id: modId, on: true })
    onRef.current = true
    setSlowMotion(true)
  }

  function stopSlowMotion() {
    const v = leaseVideo(slideKey)
    v.playbackRate = 1
    if (onRef.current && modId) track(FEED_SLOW, { module_id: modId, on: false })
    onRef.current = false
    setSlowMotion(false)
  }

  // Ушли со слайда, пока держали палец (свайп) — сбрасываем скорость, иначе
  // видео так и останется замедленным при возврате на слайд
  useEffect(() => {
    if (active || !slowMotion) return
    const v = leaseVideo(slideKey)
    v.playbackRate = 1
    onRef.current = false // ушли со слайда — не действие пользователя, feed_slow off не пишем
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlowMotion(false)
  }, [active, slowMotion, slideKey])

  return { slowMotion, startSlowMotion, stopSlowMotion }
}
