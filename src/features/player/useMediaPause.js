import { useEffect, useRef } from 'react'

// Заглушить всё, что звучит внутри узла. Нужна и заморозке, и шагу «вперёд»:
// пропуская сообщение, его звук глушим — иначе голос предыдущей ноды
// накладывается на следующую.
export function pauseAllMedia(el) {
  if (!el) return []
  const stopped = []
  el.querySelectorAll('audio, video').forEach(m => {
    if (!m.paused) { stopped.push(m); m.pause() }
  })
  return stopped
}

// Заморозка звука в шаговом режиме: разом останавливает всё, что звучит
// внутри плеера, и не даёт замороженным элементам включиться обратно.
//
// Обход DOM, а не флаг в каждом модуле: звук живёт в пяти разных модулях
// (голосовое, видео, кружок, стикер-видео, диктант таблицы), у каждого свой
// ref и своя логика автозапуска. Один перехват на общем контейнере закрывает
// их все сразу и не разъедется, когда появится шестой.
//
// Блокируются только элементы, что были на экране в момент заморозки:
// сообщение, показанное шагом «вперёд», должно отыграться — иначе у
// голосового не появился бы текст (он печатается синхронно со звуком).
export function useMediaPause(containerRef, frozen, paused) {
  const stoppedRef = useRef([])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !frozen) return

    const known = new Set(el.querySelectorAll('audio, video'))
    stoppedRef.current = pauseAllMedia(el)
    // Модуль мог дождаться загрузки файла уже после заморозки и включиться
    // сам — гасим на лету, событие play всплывает в capture-фазе
    const block = e => { if (known.has(e.target)) e.target.pause?.() }
    el.addEventListener('play', block, true)
    return () => el.removeEventListener('play', block, true)
  }, [containerRef, frozen])

  // Возобновляем прерванное только когда сняли паузу целиком: после шага
  // «вперёд» прежнее сообщение осознанно пропущено, воскрешать его нечего
  useEffect(() => {
    if (paused) return
    stoppedRef.current.forEach(m => m.play?.().catch(() => {}))
    stoppedRef.current = []
  }, [paused])

  return { forgetPaused: () => { stoppedRef.current = [] } }
}
