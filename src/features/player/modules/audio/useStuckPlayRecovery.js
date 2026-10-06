import { useEffect, useRef, useState } from 'react'
import { pLog } from '../../../../shared/lib/debug.js'

// Голосовое, которое перестало отвечать на ▶ (жалоба с iPhone: во время
// сообщения отключились Bluetooth-наушники, после переподключения кнопка
// нажималась впустую). iOS при системном прерывании аудиосессии помечает
// прерванным каждый СУЩЕСТВУЮЩИЙ <audio>; «конец прерывания» при смене
// маршрута может не прийти, и play() такого элемента дальше либо висит
// (промис не резолвится, событий нет — старые iOS), либо тут же
// откатывается AbortError. Выход один — новый элемент: у него своя сессия.
//
// elKey — key для <audio>: смена пересоздаёт элемент. watch(audio, promise)
// зовётся после каждого play(): завис — пересоздаём и один раз повторяем
// запуск сами (жест уже прошёл, но страница после касания и так разрешает
// звук); AbortError — только пересоздаём, без повтора: тот же AbortError
// даёт и честная пауза (замок solo, тап ⏸ сразу после ▶), автоповтор тут
// включил бы то, что только что остановили.
const STUCK_MS = 1500

export function useStuckPlayRecovery(audioRef, retry) {
  const [elKey, setElKey] = useState(0)
  const retryRef   = useRef(false) // после пересоздания — запустить самим
  const inRetryRef = useRef(false) // watch() зовётся из нашего повтора, не из тапа
  const retriedRef = useRef(false) // повтор уже был с последнего тапа — больше не крутим

  useEffect(() => {
    if (!retryRef.current) return
    retryRef.current = false
    inRetryRef.current = true
    try { retry() } finally { inRetryRef.current = false }
    // retry — функция компонента, читает актуальные рефы; срабатываем только
    // на пересоздание элемента
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elKey])

  function remount(why, withRetry) {
    pLog(`AudioModule: ${why} — пересоздаём <audio>${withRetry ? ' и повторяем запуск' : ''}`)
    retryRef.current = withRetry
    if (withRetry) retriedRef.current = true
    setElKey(k => k + 1)
  }

  function watch(audio, promise) {
    // Новый тап пользователя — повтор снова разрешён (один на тап)
    if (!inRetryRef.current) retriedRef.current = false
    let settled = false
    const timer = setTimeout(() => {
      if (settled || audioRef.current !== audio || !audio.paused) return
      remount('play() завис (элемент прерван аудиосессией)', !retriedRef.current)
    }, STUCK_MS)
    promise.then(
      () => { settled = true; clearTimeout(timer) },
      e => {
        settled = true; clearTimeout(timer)
        if (e?.name === 'AbortError' && audioRef.current === audio) remount(`play() → ${e.name}`, false)
      },
    )
  }

  return { elKey, watch }
}
