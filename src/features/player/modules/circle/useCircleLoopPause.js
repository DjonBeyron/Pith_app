import { useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Декоративный беззвучный цикл кружка (после первого озвученного
// проигрывания или у кружка из истории) крутил аппаратный декодер весь урок,
// даже уехав на 60 сообщений вверх: датчик на iPhone показывал `video=4/1`
// все 10 минут, телефон грелся. Вне экрана ставим на паузу, при возврате
// запускаем снова (muted-видео браузер разрешает без жеста).
//
// Трогаем ТОЛЬКО зацикленный беззвучный режим (muted && loop): первое
// озвученное проигрывание ведёт сценарий (onEnded → onDone), его не трогаем —
// иначе ученик, листнувший ленту вверх во время реплики, застрял бы.
//
// IntersectionObserver от viewport: он учитывает обрезку вложенным скроллом
// ленты (.playerFeed), отдельный root не нужен
export function useCircleLoopPause(wrapRef, vRef, enabled) {
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !enabled || typeof IntersectionObserver === 'undefined') return
    let pausedOffscreen = false
    const io = new IntersectionObserver(([entry]) => {
      const v = vRef.current
      if (!v) return
      if (!entry.isIntersecting) {
        if (v.muted && v.loop && !v.paused) {
          v.pause()
          pausedOffscreen = true
          pLog('[circle] вне экрана → пауза беззвучного цикла')
        }
      } else if (pausedOffscreen) {
        pausedOffscreen = false
        v.play().catch(() => {})
        pLog('[circle] снова на экране → цикл продолжен')
      }
    }, { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [wrapRef, vRef, enabled])
}
