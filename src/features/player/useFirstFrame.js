import { useEffect, useState } from 'react'

// true, когда <video> реально показал кадр (а не только загрузил данные).
// Пока false — модуль держит поверх видео свой стоп-кадр (<img> с той же
// геометрией), и убирает его ровно в момент, когда под ним уже есть картинка
// видео: без чёрной вспышки и без скачка кадра при смене «стоп-кадр → видео».
// Источник — requestVideoFrameCallback (кадр передан композитору), запасной —
// событие playing. Сброс при смене src без setState в эффекте: помним, для
// какого src кадр уже был.
export function useFirstFrame(videoRef, src) {
  const [framedSrc, setFramedSrc] = useState(null)
  useEffect(() => {
    const v = videoRef.current
    if (!v || !src) return
    let dead = false
    let vfcId = null
    const done = () => { if (!dead) setFramedSrc(src) }
    v.addEventListener('playing', done)
    if (v.requestVideoFrameCallback) vfcId = v.requestVideoFrameCallback(done)
    return () => {
      dead = true
      v.removeEventListener('playing', done)
      if (vfcId != null && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(vfcId)
    }
  }, [videoRef, src])
  return !!src && framedSrc === src
}
