import { useCallback, useEffect, useRef, useState } from 'react'
import { fsFrameSize, isFsCloseGesture } from './sceneFullscreenModel.js'

// Полноэкранный показ сцены по тапу (как видео — useVideoFullscreen.jsx): состояние
// слоя, размер кадра 9:16 по рамке плеера (.lessonPlayer: на телефоне — окно, на
// десктопе — «телефон» 420px), жесты закрытия — фон/крестик, свайп вниз (как у
// кружка), Escape. Разметка — SceneFullscreenView.jsx; перенос реплики между лентой
// и экраном — useScenePlayback.js (openFs/closeFs). Пересчёт кадра — на resize.
export function useSceneFullscreen({ open, rootRef, onClose }) {
  const [frame, setFrame] = useState(null)
  const touchY = useRef(0)

  const measure = useCallback(() => {
    const box = rootRef.current?.closest?.('.lessonPlayer')?.getBoundingClientRect()
    const w = box?.width ?? window.innerWidth
    const h = box?.height ?? window.innerHeight
    setFrame({ ...fsFrameSize({ w, h }, { pad: 0 }), left: box?.left ?? 0, top: box?.top ?? 0, w, h })
  }, [rootRef])

  useEffect(() => {
    if (!open) return undefined
    measure()
    window.addEventListener('resize', measure)
    const onKey = e => { if (isFsCloseGesture({ key: e.key })) { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', measure)
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
