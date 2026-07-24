import { useState, useEffect } from 'react'
import { leaseVideo } from './videoPool.js'

// Замедленное воспроизведение 0.5x: держим палец в зоне (feedSlowZone) —
// playbackRate уходит на 0.5, preservesPitch сам держит высоту голоса
// нормальной; отпустили — обратно на 1x. Доступно только при включённом
// звуке — без него эффект не слышен и бессмысленен. Общий для ленты
// (FeedSlide) и «Моих уроков» (MyLessonSlide) — оба держат видео в одном
// пуле (videoPool) под своим slideKey.
export function useSlowMotion(slideKey, active, soundOn) {
  const [slowMotion, setSlowMotion] = useState(false)

  function startSlowMotion(e) {
    if (!active || !soundOn) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* не критично */ }
    const v = leaseVideo(slideKey)
    v.playbackRate = 0.5
    v.preservesPitch = true
    v.webkitPreservesPitch = true
    setSlowMotion(true)
  }

  function stopSlowMotion() {
    const v = leaseVideo(slideKey)
    v.playbackRate = 1
    setSlowMotion(false)
  }

  // Ушли со слайда, пока держали палец (свайп) — сбрасываем скорость, иначе
  // видео так и останется замедленным при возврате на слайд
  useEffect(() => {
    if (active || !slowMotion) return
    const v = leaseVideo(slideKey)
    v.playbackRate = 1
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlowMotion(false)
  }, [active, slowMotion, slideKey])

  return { slowMotion, startSlowMotion, stopSlowMotion }
}
