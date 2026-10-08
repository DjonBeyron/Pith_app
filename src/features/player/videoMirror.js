import { useEffect, useRef, useState } from 'react'
import { VIDEO_CANVAS, noteCanvasDraw } from '../../shared/lib/videoCanvasMode.js'
import { frameLooksBlack } from '../../shared/lib/frameBlack.js'
import { pLog } from '../../shared/lib/debug.js'

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
//
// Защита от чёрного кадра (Android, аппаратный декодер): drawImage сразу после
// loadeddata/первого вызова отдаёт чёрное, пока кадр не презентован. Первые
// GUARD_MS пока не нарисован настоящий кадр, чёрные кадры НЕ рисуются —
// поверх остаются постер/скелетон, а не чёрный круг. Тёмное, но не чёрное
// видео и ролик, полностью чёрный в начале, после GUARD_MS рисуются как есть.
// Для неподвижного (paused) видео, где requestVideoFrameCallback может молчать,
// кадр забирается и по событиям loadeddata/seeked/canplay/playing/timeupdate.
// onFrame() — один раз, когда в canvas легла настоящая картинка (а не постер):
// модуль до этого держит скелетон, если постера нет.
const GUARD_MS = 2500
const FRAME_EVENTS = ['loadeddata', 'seeked', 'canplay', 'playing', 'timeupdate']

export function useVideoMirror(videoRef, canvasRef, enabled, posterUrl = null, onFrame = null) {
  // Состояние живёт между перезапусками эффекта (постер пришёл позже и
  // перезапустил его): иначе постер затёр бы уже нарисованное видео
  const stRef = useRef({ el: null, painted: false, real: false })
  const onFrameRef = useRef(onFrame)
  useEffect(() => { onFrameRef.current = onFrame })

  useEffect(() => {
    if (!enabled) return
    const v = videoRef.current
    const c = canvasRef.current
    if (!v || !c) return
    const ctx = c.getContext('2d')
    if (!ctx) return

    const st = stRef.current
    if (st.el !== v) { st.el = v; st.painted = false; st.real = false }

    let stopped = false
    let rafId = null
    let vfcId = null
    const startedAt = performance.now()
    let loggedBlack = false

    const fit = (w, h) => {
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
    }

    // meta — от requestVideoFrameCallback: по presentedFrames видно пропуски
    let lastPresented = null
    const paint = meta => {
      if (stopped) return
      const w = v.videoWidth, h = v.videoHeight
      if (!w || !h || v.readyState < 2) return
      if (!st.real) {
        if (performance.now() - startedAt < GUARD_MS && frameLooksBlack(v)) {
          if (!loggedBlack) { loggedBlack = true; pLog('[mirror] кадр чёрный — не рисуем, ждём презентации') }
          return
        }
        st.real = true
      }
      fit(w, h)
      const t0 = performance.now()
      ctx.drawImage(v, 0, 0, w, h)
      const pf = meta?.presentedFrames
      noteCanvasDraw(performance.now() - t0, pf != null && lastPresented != null ? Math.max(0, pf - lastPresented - 1) : 0)
      if (pf != null) lastPresented = pf
      if (!st.painted) { st.painted = true; onFrameRef.current?.() }
    }
    const draw = (_now, meta) => {
      paint(meta)
      schedule()
    }
    const onEvent = () => { if (!st.real) paint() }

    const schedule = () => {
      if (stopped) return
      if (v.requestVideoFrameCallback) vfcId = v.requestVideoFrameCallback(draw)
      else rafId = requestAnimationFrame(draw)
    }

    // Постер — только пока не пришёл первый настоящий кадр
    if (posterUrl) {
      const img = new Image()
      img.onload = () => {
        if (stopped || st.painted) return
        fit(img.naturalWidth, img.naturalHeight)
        ctx.drawImage(img, 0, 0)
      }
      img.src = posterUrl
    }

    for (const ev of FRAME_EVENTS) v.addEventListener(ev, onEvent)
    // Страховка: ролик чёрный и неподвижный — после окна защиты рисуем как есть
    const guardTimer = st.real ? null : setTimeout(onEvent, GUARD_MS + 50)
    paint() // кадр мог быть готов до монтирования эффекта
    schedule()
    return () => {
      stopped = true
      clearTimeout(guardTimer)
      for (const ev of FRAME_EVENTS) v.removeEventListener(ev, onEvent)
      if (rafId) cancelAnimationFrame(rafId)
      if (vfcId && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfcId)
    }
  }, [enabled, videoRef, canvasRef, posterUrl])
}
