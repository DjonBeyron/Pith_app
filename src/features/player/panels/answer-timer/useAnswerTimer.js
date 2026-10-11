import { useEffect, useRef, useState } from 'react'
import { createCountdown } from '../../../../shared/lib/countdown.js'
import { readTimeLimit } from '../../../../shared/lib/timeLimit.js'
import { usePref } from '../../lessonPrefs.js'

const TICK_MS = 100

// Таймер на ответ для «Выбери слово» и «Собери фразу» (поле ноды timeLimitSec). Идёт, пока active (панель показана и ответ ещё не дан);
// остановка (active=false) время не сжигает, скрытая вкладка тоже. Выключен, если у ноды нет лимита или ученик выключил таймеры в настройках урока.
// onExpire зовётся ровно один раз. Возвращает { fraction } (остаток 1..0) для полоски или null, если таймера нет.
export function useAnswerTimer({ seconds, active, onExpire }) {
  const enabled = usePref('timer')
  const limit = readTimeLimit(seconds)
  const on = enabled && limit != null
  const [fraction, setFraction] = useState(1)
  const counter = useRef(null)
  const firedRef = useRef(false)
  const expireRef = useRef(onExpire)
  useEffect(() => { expireRef.current = onExpire })

  useEffect(() => {
    if (!on || !active || firedRef.current) return undefined
    counter.current ??= createCountdown(limit * 1000)
    const c = counter.current
    c.resume(performance.now())
    const step = () => {
      const r = c.tick(performance.now(), document.visibilityState !== 'hidden')
      setFraction(r.fraction)
      if (r.expired && !firedRef.current) { firedRef.current = true; expireRef.current?.() }
    }
    const id = setInterval(step, TICK_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') c.resume(performance.now()) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [on, active, limit])

  return on ? { fraction } : null
}
