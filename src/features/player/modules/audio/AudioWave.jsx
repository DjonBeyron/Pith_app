import { useEffect, useRef, useImperativeHandle } from 'react'
import { drawAudioWave } from './audioWaveParts.js'

const FADE_MS = 550

// Волна голосового — один <canvas>. Рисуется при монтировании, смене
// waveData и смене ширины дорожки; во время игры родитель (AudioModule)
// дёргает setProgress() из своего цикла кадров, а перерисовка случается
// только когда заливка добежала до следующей полоски (≈70 раз за всё
// голосовое, а не 60 раз в секунду). Никаких слоёв GPU, никакой анимации
// высот — форма волны у сообщения одна и та же и до, и во время, и после.
//
// ready=false — волна ещё считается (у ноды нет сохранённой waveformData):
// canvas прозрачный, чтобы ученик не видел, как базовый набор высот
// подменяется настоящей формой — это читалось как «спектр перестраивается».
//
// Canvas не влияет на раскладку (width:100% от колонки, высота фиксирована),
// поэтому смена плотности полосок больше не меняет ширину пузыря — а именно
// это раньше ловил ResizeObserver в PlayerBubble и анимировал как
// «пузырь перестраивается» (см. историю в PROJECT.md)
export default function AudioWave({ waveData, ready = true, ref }) {
  const canvasRef   = useRef(null)
  const progressRef = useRef(0)
  const countRef    = useRef(0)   // полосок в последней отрисовке (0 = ещё не рисовали)
  const greenRef    = useRef(-1)  // зелёных полосок в последней отрисовке
  const fadeRef     = useRef(0)   // rAF затухания заливки в конце записи

  function stopFade() {
    if (fadeRef.current) { cancelAnimationFrame(fadeRef.current); fadeRef.current = 0 }
  }

  useImperativeHandle(ref, () => ({
    setProgress(p) {
      stopFade()
      progressRef.current = p
      const c = canvasRef.current
      // Полосок ещё не знаем (первая отрисовка попала на нулевую ширину) —
      // рисуем безусловно, иначе заливка молча пропускала бы все кадры до
      // следующего ресайза
      const green = countRef.current ? Math.floor(p * countRef.current) : -1
      if (green >= 0 && green === greenRef.current) return
      countRef.current = drawAudioWave(c, waveData, p)
      greenRef.current = Math.floor(p * countRef.current)
    },
    // Конец записи: заливка гаснет плавно (как раньше у div-полосок), а не
    // схлопывается в ноль на том же кадре, где кончился звук
    finish() {
      stopFade()
      const c = canvasRef.current
      const t0 = performance.now()
      const step = now => {
        const k = Math.min(1, (now - t0) / FADE_MS)
        countRef.current = drawAudioWave(c, waveData, 1, 1 - k)
        if (k < 1) { fadeRef.current = requestAnimationFrame(step); return }
        fadeRef.current = 0
        progressRef.current = 0
        greenRef.current = 0
      }
      fadeRef.current = requestAnimationFrame(step)
    },
    // Для дебаг-лога: сколько полосок и сколько из них зелёных сейчас
    getState() {
      return { count: countRef.current, green: greenRef.current, width: canvasRef.current?.clientWidth ?? 0 }
    },
  }), [waveData])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const draw = () => {
      countRef.current = drawAudioWave(c, waveData, progressRef.current)
      greenRef.current = Math.floor(progressRef.current * countRef.current)
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(c)
    return () => { ro.disconnect(); stopFade() }
  }, [waveData])

  return (
    <canvas
      ref={canvasRef}
      className={ready ? 'playerAudioWave' : 'playerAudioWave playerAudioWave--pending'}
      aria-hidden="true"
    />
  )
}
