import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { fsCoverFrame, isFsCloseGesture } from './sceneFullscreenModel.js'

// Полноэкранный показ сцены по тапу (как видео — useVideoFullscreen.jsx): состояние слоя, геометрия кадра
// «на весь экран» (sceneFullscreenModel.fsCoverFrame: масштаб по ширине/высоте рамки плеера, фон за краями
// сцены продолжается — пустых полос нет), жесты закрытия — крестик, свайп вниз (как у кружка), Escape.
// Рамка плеера (.lessonPlayer): на телефоне — окно, на десктопе — «телефон» 420px (как у видео, stageDims).
// Safe-area читаем браузером: невидимый зонд с padding: env(safe-area-inset-*) → px; учитываем её только
// у тех краёв рамки, что совпадают с краем окна. Пересчёт — на resize / visualViewport / поворот.
// Разметка — SceneFullscreenView.jsx; перенос реплики между лентой и экраном — useScenePlayback.js.
function readInsets(probe, box) {
  const cs = probe ? getComputedStyle(probe) : null
  const top = parseFloat(cs?.paddingTop) || 0
  const bottom = parseFloat(cs?.paddingBottom) || 0
  return {
    safeTop: box.top <= 0.5 ? top : 0,
    safeBottom: box.bottom >= window.innerHeight - 0.5 ? bottom : 0,
  }
}

export function useSceneFullscreen({ open, rootRef, probeRef, onClose }) {
  const [frame, setFrame] = useState(null)
  const touchY = useRef(0)

  const measure = useCallback(() => {
    const player = rootRef.current?.closest?.('.lessonPlayer')?.getBoundingClientRect()
    const box = player ?? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight }
    const { safeTop, safeBottom } = readInsets(probeRef.current, box)
    const next = { left: box.left, top: box.top, w: box.width, h: box.height, safeTop, safeBottom }
    setFrame(prev => (prev && Object.keys(next).every(k => prev[k] === next[k]) ? prev : { ...next, cover: fsCoverFrame(next, next) }))
  }, [rootRef])

  useLayoutEffect(() => { if (open) measure() }, [open, measure]) // до первой отрисовки — без вспышки

  useEffect(() => {
    if (!open) return undefined
    const vv = window.visualViewport
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    vv?.addEventListener('resize', measure)
    const onKey = e => { if (isFsCloseGesture({ key: e.key })) { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      vv?.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, measure, onClose])

  const onTouchStart = useCallback(e => { touchY.current = e.touches?.[0]?.clientY ?? 0 }, [])
  const onTouchEnd = useCallback(e => {
    const y = e.changedTouches?.[0]?.clientY ?? 0
    if (isFsCloseGesture({ dy: y - touchY.current })) onClose()
  }, [onClose])

  return { frame, onTouchStart, onTouchEnd }
}
