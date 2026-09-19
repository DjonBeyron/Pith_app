import { useEffect, useRef, useImperativeHandle } from 'react'
import { drawAudioWave } from './audioWaveParts.js'

// Волна голосового — один <canvas>. Рисуется при монтировании, смене
// waveData и смене ширины дорожки; во время игры родитель (AudioModule)
// дёргает setProgress() из своего цикла кадров, а перерисовка случается
// только когда заливка добежала до следующей полоски (≈70 раз за всё
// голосовое, а не 60 раз в секунду). Никаких слоёв GPU, никакой анимации
// высот — форма волны у сообщения одна и та же и до, и во время, и после.
//
// Canvas не влияет на раскладку (width:100% от колонки, высота фиксирована),
// поэтому смена плотности полосок больше не меняет ширину пузыря — а именно
// это раньше ловил ResizeObserver в PlayerBubble и анимировал как
// «пузырь перестраивается» (см. историю в PROJECT.md)
export default function AudioWave({ waveData, ref }) {
  const canvasRef   = useRef(null)
  const progressRef = useRef(0)
  const countRef    = useRef(0)   // полосок в последней отрисовке
  const greenRef    = useRef(-1)  // зелёных полосок в последней отрисовке

  useImperativeHandle(ref, () => ({
    setProgress(p) {
      progressRef.current = p
      const green = Math.floor(p * countRef.current)
      if (green === greenRef.current) return
      greenRef.current = green
      countRef.current = drawAudioWave(canvasRef.current, waveData, p)
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
    return () => ro.disconnect()
  }, [waveData])

  return <canvas ref={canvasRef} className="playerAudioWave" aria-hidden="true" />
}
