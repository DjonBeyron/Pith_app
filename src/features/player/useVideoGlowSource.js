import { useEffect, useRef } from 'react'
import { publishLevel, unpublishLevel, speechEnvelope } from './audioLevel.js'
import { getLessonMuted } from './lessonVolume.js'

// <video> в ленте (видео, кружок, видео-стикер, полноэкранный просмотр) →
// свечение снизу чата (audioLevel.js). Волны у видео нет — синтезированная
// огибающая речи, пока элемент РЕАЛЬНО звучит. Беззвучная петля (autoplay
// muted: видео в пузыре, кружок и стикер после первого прохода) крутится без
// звука — свечения нет. Правило: играет и не заглушен; исключение — элемент
// немой ТОЛЬКО из-за «без звука» в шапке урока (lessonVolume.js), а модуль
// по своей логике играл бы со звуком (soundIntended) — тогда светим, как и у
// голосовых: анимации от кнопки шапки не зависят.
export function videoGlowAudible(el, soundIntended = null, lessonMuted = getLessonMuted()) {
  if (!el || el.paused || el.ended) return false
  if (!el.muted && el.volume > 0) return true
  return !!(lessonMuted && soundIntended?.())
}

const EVENTS = ['play', 'playing', 'pause', 'ended', 'volumechange', 'emptied']

// Слушаем события САМОГО элемента (play/pause/ended + volumechange — так
// браузер сообщает о смене muted, emptied — смена/сброс src), а не свои
// кнопки: остановка снаружи (useMediaPause, useCircleLoopPause, тулбар)
// гасит свечение сама. Ключ источника — сам элемент. src — ключ
// пересоздания элемента; soundIntended читается через ref — модули передают
// стрелку, пересоздавать подписку на каждый рендер незачем
export function useVideoGlowSource(videoRef, src = null, soundIntended = null) {
  const intendedRef = useRef(soundIntended)
  useEffect(() => { intendedRef.current = soundIntended })

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const sync = () => {
      if (videoGlowAudible(el, intendedRef.current)) {
        publishLevel(el, { playing: true, getLevel: () => speechEnvelope(el.currentTime, el.duration) })
      } else unpublishLevel(el)
    }
    EVENTS.forEach(e => el.addEventListener(e, sync))
    sync()
    return () => {
      EVENTS.forEach(e => el.removeEventListener(e, sync))
      unpublishLevel(el)
    }
  }, [videoRef, src])
}
