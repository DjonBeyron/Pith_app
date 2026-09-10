import { useEffect } from 'react'
import { pLog } from '../../shared/lib/debug.js'

// В переписке звучит что-то одно. Запустили голосовое — видео, которое играло
// выше, встаёт на паузу; запустили видео — замолкает голосовое. Раньше их
// можно было развести руками и слушать оба разом: каждый модуль знал только
// про свой <audio>/<video> и про соседей не догадывался.
//
// Один перехват на контейнере плеера, а не флаг в каждом модуле: звук живёт в
// пяти разных местах (голосовое, видео, кружок, стикер-видео, аудио таблицы),
// у каждого свой ref и своя логика автозапуска. Событие 'play' не всплывает,
// поэтому слушаем в capture-фазе — так ловятся и элементы, добавленные позже.
//
// Ставим именно ПАУЗУ, а не стоп: позиция сохраняется, и к отложенному
// сообщению можно вернуться с того же места.
// Надо ли глушить `other`, раз запустился `started`. Вынесено отдельно, чтобы
// правило можно было проверить целиком, не поднимая DOM.
//
// Два исключения, и оба про немой звук:
//  · запуск БЕЗ звука никого не перебивает — кружок и стикер-видео в покое
//    крутятся muted-петлёй (CircleModule, StickerModule), и без этой проверки
//    каждый их цикл глушил бы голосовое, которое ученик как раз слушает;
//  · немую петлю и не останавливаем — слушать она не мешает, а пауза
//    превратила бы живой кружок в стоп-кадр.
export function shouldYieldTo(started, other) {
  if (!started || started.muted) return false
  if (!other || other === started || other.paused || other.muted) return false
  return true
}

export function useSoloMedia(containerRef) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onPlay = e => {
      const started = e.target
      if (!started || typeof started.pause !== 'function') return
      el.querySelectorAll('audio, video').forEach(m => {
        if (!shouldYieldTo(started, m)) return
        pLog(`[solo] ${m.tagName.toLowerCase()} на паузу — запустилось другое`)
        m.pause()
      })
    }

    el.addEventListener('play', onPlay, true)
    return () => el.removeEventListener('play', onPlay, true)
  }, [containerRef])
}
