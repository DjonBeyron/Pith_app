import { useEffect, useState } from 'react'
import { collectDiagContext } from '../../../../../shared/lib/speech/sayDiagContext.js'

export const DIAG_POLL_MS = 1000

// Живые данные админской диагностики «Сказать фразу». ПОКА ОКНО ЗАКРЫТО — ни таймера, ни опроса, ни подписок (эффект выходит сразу); открыто — сбор раз в секунду
// (sayDiagContext.js: состояние Vosk, кэш модели, фоновая загрузка, журнал последней попытки, среда телефона). Закрыли — таймер снят, данные сброшены.
export function useSayDiag(open, phrase, voice = false) {
  const [ctx, setCtx] = useState(null)
  useEffect(() => {
    if (!open) return undefined
    let alive = true
    const tick = () => { collectDiagContext({ phrase, voice }).then(c => { if (alive) setCtx(c) }).catch(() => {}) }
    tick()
    const id = setInterval(tick, DIAG_POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [open, phrase, voice])
  return open ? ctx : null
}
