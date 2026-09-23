import { useEffect } from 'react'
import { noteCanvasDraw } from '../../shared/lib/videoCanvasMode.js'

// «Видео через canvas» в ленте (на Android сам, см. videoCanvasMode.js) — обход «дымки»
// на части Android (Mali-G72): <video> там выводится с неверным диапазоном
// (16–235 как 0–255), а та же картинка, нарисованная в canvas, — верная
// (поэтому стоп-кадр до старта видео нормальный, а видео — «в дымке»).
// Элемент пула только декодирует (класс videoMirrorSource, см. videoPool.js),
// кадры рисуются в canvas слайда. Элемент приходит и уходит (аренда в
// SlideVideo) — следим за корнем слайда; прозрачность с плавным появлением
// копируем с <video>, чтобы до первого кадра был виден постер.
export function useFeedVideoCanvas(rootRef, canvasRef, enabled) {
  useEffect(() => {
    const root = rootRef.current
    const c = canvasRef.current
    const ctx = enabled && c ? c.getContext('2d') : null
    if (!root || !ctx) return
    let v = null
    let frameId = null
    let drawnUrl = null
    let stopped = false

    const sync = () => {
      if (!v) return
      if (c.style.transition !== v.style.transition) c.style.transition = v.style.transition
      if (c.style.opacity !== v.style.opacity) c.style.opacity = v.style.opacity
      // Элемент пула сменил видео — чужой кадр не показываем
      if (drawnUrl && v.dataset.url !== drawnUrl) { ctx.clearRect(0, 0, c.width, c.height); drawnUrl = null }
    }
    // meta — от requestVideoFrameCallback: по presentedFrames видно пропуски
    let lastPresented = null
    const draw = (_now, meta) => {
      if (!v || stopped) return
      sync()
      const w = v.videoWidth
      const h = v.videoHeight
      if (!w || !h || v.readyState < 2) return
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
      const t0 = performance.now()
      ctx.drawImage(v, 0, 0, w, h)
      const pf = meta?.presentedFrames
      noteCanvasDraw(performance.now() - t0, pf != null && lastPresented != null ? Math.max(0, pf - lastPresented - 1) : 0)
      if (pf != null) lastPresented = pf
      drawnUrl = v.dataset.url
    }
    const loop = (now, meta) => {
      draw(now, meta)
      if (stopped || !v) return
      frameId = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop)
    }
    const unbind = () => {
      if (!v) return
      if (frameId != null) {
        if (v.requestVideoFrameCallback) v.cancelVideoFrameCallback(frameId)
        else cancelAnimationFrame(frameId)
      }
      v.removeEventListener('loadeddata', draw)
      v.removeEventListener('seeked', draw)
      v = null
      frameId = null
    }
    const bind = () => {
      const el = root.querySelector('video')
      if (el === v) { sync(); return }
      unbind()
      v = el
      lastPresented = null
      if (!v) return
      v.addEventListener('loadeddata', draw)
      v.addEventListener('seeked', draw)
      loop()
    }

    const mo = new MutationObserver(bind)
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'data-url'] })
    bind()
    return () => { stopped = true; mo.disconnect(); unbind() }
  }, [rootRef, canvasRef, enabled])
}
