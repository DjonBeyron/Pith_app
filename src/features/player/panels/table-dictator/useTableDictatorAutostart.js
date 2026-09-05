import { useRef, useEffect } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'
import { createSilentClock } from '../../../../shared/lib/silentClock.js'
import { logAudioPlayRejected } from './dictatorDebug.js'
import { timelineEndSec } from '../../../../shared/lib/tableDictatorTiming.js'

// Как прогон стартует без тапа пользователя: обычный автозапуск <audio>, и
// подстраховка часами (silentClock.js) без звука, когда играть нечем/нечему —
// таблицу смонтировали без озвучки, файл не подгрузился, браузер не дал
// автозапуск без жеста пользователя, аудио споткнулось на загрузке/декодировании,
// или молча не стартовало за 3с. Весь RAF-код (useTableDictatorRaf) читает
// audioRef.current.currentTime и подмены на часы не замечает.
// Вынесено из TableDictatorPanel.jsx — там же остаются startRun/handleEnded/
// slideDown, на чьи актуальные версии (через ref) эта логика опирается.
export function useTableDictatorAutostart({
  audioSrc, timeline, tData, audioRef, hasPlayedRef, endedRef, startedRef, slideDownRef, setHudVisible,
}) {
  const autoPlayFired = useRef(false)
  const clockRef       = useRef(null)

  // Длительность прогона: длина композиции из таймлайна → аудио + 10с → как
  // крайний случай конец самого позднего клипа с небольшим запасом. Что-то из
  // этого есть всегда, если таймлайн вообще смонтирован
  const silentDur = tData.timelineLen
    ?? (tData.duration ? tData.duration + 10 : Math.ceil(timelineEndSec(timeline?.layers) + 2))
  const canRunClock = silentDur > 0 && !!timeline?.layers?.length
  const silentMode  = !audioSrc && canRunClock

  function runWithClock() {
    if (clockRef.current || !canRunClock) return
    hasPlayedRef.current = true
    const clock = createSilentClock(silentDur, { onEnded: () => endedRef.current?.() })
    clockRef.current = clock
    audioRef.current = clock
    clock.play()
    startedRef.current?.()
  }

  useEffect(() => {
    if (!audioSrc) return
    if (autoPlayFired.current) {
      // Звук пришёл, когда прогон уже кем-то начат (обычно часами — файл
      // раскрылся позже 800мс). Молча идём дальше без звука, но помечаем в логе
      pLog('[td-auto] audioSrc пришёл после старта прогона — звука не будет')
      return
    }
    autoPlayFired.current = true
    const hudId   = setTimeout(() => setHudVisible(true), 400)
    const audioId = setTimeout(() => audioRef.current?.play().catch(e => {
      logAudioPlayRejected(e, audioSrc)
      pLog('[td-auto] автозапуск отклонён — крутим таймлайн часами, без звука')
      runWithClock()
    }), 800)
    return () => {
      clearTimeout(hudId); clearTimeout(audioId)
      if (!hasPlayedRef.current) autoPlayFired.current = false
    }
  }, [audioSrc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Флаг поднимаем в МОМЕНТ старта часов, а не при планировании. Локальный файл
  // (только что сгенерированный TTS, ещё не синхронизированный) даёт blob-URL
  // лишь со второго рендера: на первом audioSrc=null → silentMode=true. Раньше
  // этот эффект тут же столбил autoPlayFired за собой, и пришедший через кадр
  // audioSrc уже игнорировался аудио-эффектом, а часы отменял собственный
  // cleanup — не играло НИЧЕГО, пока не срабатывала 3-секундная страховка.
  useEffect(() => {
    if (!silentMode || autoPlayFired.current) return
    const startId = setTimeout(() => {
      if (autoPlayFired.current) return   // аудио успело перехватить старт
      autoPlayFired.current = true
      runWithClock()
    }, 800)
    return () => clearTimeout(startId)
  }, [silentMode]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => clockRef.current?.stop?.(), [])

  // Последняя страховка: аудио так и не заиграло за 3 секунды — файл не
  // подгрузился, декодер споткнулся, вкладка была скрыта. Прогон всё равно
  // должен состояться: крутим таймлайн часами. Уезжаем вниз молча только если
  // крутить нечего (таймлайна у ноды нет вовсе).
  useEffect(() => {
    const id = setTimeout(() => {
      if (hasPlayedRef.current) return
      if (canRunClock) {
        pLog('[td-auto] аудио не стартовало за 3с — крутим таймлайн часами')
        runWithClock()
        return
      }
      slideDownRef.current?.()
    }, 3000)
    return () => clearTimeout(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { runWithClock }
}
