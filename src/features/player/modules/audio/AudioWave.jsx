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
  // Прозрачность зелёного во время затухания; null — затухания нет. Логически
  // запись после конца уже «на нуле» (progressRef=0), затухание — чисто
  // картинка. Поэтому любая перерисовка со стороны (ResizeObserver: пузырь
  // сменил ширину, когда расшифровка допечаталась; смена waveData) рисует
  // ту же гаснущую заливку, а не стартовый полный зелёный с alpha=1 — так
  // в конце голосового вспыхивала вся дорожка и «спектр менялся»
  const fadeAlphaRef = useRef(null)

  function stopFade() {
    if (fadeRef.current) { cancelAnimationFrame(fadeRef.current); fadeRef.current = 0 }
    fadeAlphaRef.current = null
  }

  // Единственное место, где рисуется волна: во время затухания — с его
  // прозрачностью, иначе — с текущим прогрессом
  function paint(p = progressRef.current) {
    const a = fadeAlphaRef.current
    countRef.current = a == null ? drawAudioWave(canvasRef.current, waveData, p) : drawAudioWave(canvasRef.current, waveData, 1, a)
    greenRef.current = Math.floor(p * countRef.current)
  }

  useImperativeHandle(ref, () => ({
    setProgress(p) {
      // Оборванное затухание нельзя оставлять на экране: его последний кадр
      // (полупрозрачный зелёный) никто больше не перерисует — рисуем заново
      const wasFading = fadeAlphaRef.current != null
      stopFade()
      progressRef.current = p
      // Полосок ещё не знаем (первая отрисовка попала на нулевую ширину) —
      // рисуем безусловно, иначе заливка молча пропускала бы все кадры до
      // следующего ресайза
      const green = countRef.current ? Math.floor(p * countRef.current) : -1
      if (!wasFading && green >= 0 && green === greenRef.current) return
      paint(p)
    },
    // Конец записи: заливка гаснет плавно (как раньше у div-полосок), а не
    // схлопывается в ноль на том же кадре, где кончился звук. Последний кадр
    // — явная чистая отрисовка с нулевым прогрессом, а не «зелёный с alpha=0»
    finish() {
      stopFade()
      progressRef.current = 0
      greenRef.current = 0
      const t0 = performance.now()
      const step = now => {
        const k = Math.min(1, (now - t0) / FADE_MS)
        if (k < 1) {
          fadeAlphaRef.current = 1 - k
          paint(0)
          fadeRef.current = requestAnimationFrame(step)
          return
        }
        stopFade()
        paint(0)
      }
      fadeAlphaRef.current = 1
      fadeRef.current = requestAnimationFrame(step)
    },
    // Для дебаг-лога: сколько полосок и сколько из них зелёных сейчас
    getState() {
      return { count: countRef.current, green: greenRef.current, width: canvasRef.current?.clientWidth ?? 0 }
    },
    // paint читает только рефы и waveData — ручка и так пересобирается по нему
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [waveData])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const draw = () => paint()
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(c)
    return () => { ro.disconnect(); stopFade() }
    // paint читает только рефы и waveData — тот же набор, что и у ручки выше
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveData])

  return (
    <canvas
      ref={canvasRef}
      className={ready ? 'playerAudioWave' : 'playerAudioWave playerAudioWave--pending'}
      aria-hidden="true"
    />
  )
}
