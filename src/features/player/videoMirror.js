import { useEffect, useState } from 'react'
import { VIDEO_CANVAS, noteCanvasDraw } from '../../shared/lib/videoCanvasMode.js'

// Зеркалим кадры <video> в <canvas> — обход браузерной панели над видео.
//
// Яндекс.Браузер рисует поверх видео свою панель (перевод, «в отдельном окне»,
// «…»), и атрибутами страницы её не убрать: это интерфейс самого браузера.
// Единственный способ — не показывать <video>: элемент остаётся ради
// декодирования и звука, но сжимается до пары пикселей и прячется, а кадры
// рисуются в canvas. Цепляться панели становится не за что.
//
// Только на широких экранах: там и водится Яндекс.Браузер, а на телефонах
// (особенно iOS) видео и без того хрупкое — трогать его там незачем.
const WIDE_QUERY = '(min-width: 900px)'

export function useWideScreen() {
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(WIDE_QUERY).matches,
  )
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE_QUERY)
    if (!mq) return
    const onChange = e => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  // «Видео через canvas» — зеркало и на Android (обход дымки, videoCanvasMode.js)
  return !!wide || VIDEO_CANVAS
}

// Рисует в canvas каждый новый кадр видео. requestVideoFrameCallback даёт
// ровно кадры видео (без лишних отрисовок при паузе); где его нет — обычный
// rAF. posterUrl рисуется до первого кадра, чтобы не мелькала пустота.
export function useVideoMirror(videoRef, canvasRef, enabled, posterUrl = null) {
  useEffect(() => {
    if (!enabled) return
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    let stopped = false
    let rafId = null
    let vfcId = null
    let painted = false

    const fit = (w, h) => {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    }

    // meta — от requestVideoFrameCallback: по presentedFrames видно пропуски
    let lastPresented = null
    const draw = (_now, meta) => {
      if (stopped) return
      const w = v.videoWidth, h = v.videoHeight
      if (w && h) {
        fit(w, h)
        const t0 = performance.now()
        ctx.drawImage(v, 0, 0, w, h)
        const pf = meta?.presentedFrames
        noteCanvasDraw(performance.now() - t0, pf != null && lastPresented != null ? Math.max(0, pf - lastPresented - 1) : 0)
        if (pf != null) lastPresented = pf
        painted = true
      }
      schedule()
    }

    const schedule = () => {
      if (stopped) return
      if (v.requestVideoFrameCallback) vfcId = v.requestVideoFrameCallback(draw)
      else rafId = requestAnimationFrame(draw)
    }

    // Постер — только пока не пришёл первый настоящий кадр
    if (posterUrl) {
      const img = new Image()
      img.onload = () => {
        if (stopped || painted) return
        fit(img.naturalWidth, img.naturalHeight)
        ctx.drawImage(img, 0, 0)
      }
      img.src = posterUrl
    }

    schedule()
    return () => {
      stopped = true
      if (rafId) cancelAnimationFrame(rafId)
      if (vfcId && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfcId)
    }
  }, [enabled, videoRef, canvasRef, posterUrl])
}
