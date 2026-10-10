import { useState, useEffect } from 'react'
import { holdsReady, readyDelayLeft } from '../../../../shared/lib/speech/sayReadyDelay.js'
import { isIos } from '../../../../shared/lib/soundVolume.js'

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden'

// Видимое состояние круга-микрофона с отложенным переходом locked → ready (правила и числа — sayReadyDelay.js). target — настоящее состояние (micVisualState): решения по доступу
// (decide(), автопопап, тапы) читают именно его и работают сразу, задержка ТОЛЬКО в том, что видит ученик. Монтирование с уже выданным доступом (в том числе ответ Permissions API,
// пришедший сразу после открытия модуля), active/done/off и отзыв доступа показываются без задержки. На iPhone отсчёт идёт от последнего из «цель стала ready» и «приложение вернулось» (focus / visibilitychange → visible: системный диалог закрыт).
// Таймер и слушатели живут, пока идёт удержание; чистятся при размонтировании и когда цель сменилась (например, пошла запись).
export function useDelayedMicState(target, { ios = isIos(), settled = true } = {}) {
  const [shown, setShown] = useState(target)
  const [wasSettled, setWasSettled] = useState(settled)
  if (settled !== wasSettled) setWasSettled(settled)
  // settled — Permissions API уже ответил; в самом рендере, где он ответил (wasSettled ещё false), ready — «доступ уже был при открытии модуля»: показываем сразу, без задержки
  const hold = holdsReady({ shown, target, settled: settled && wasSettled })
  if (!hold && shown !== target) setShown(target) // всё, кроме locked → ready, показываем сразу (сброс при рендере)

  useEffect(() => {
    if (!hold) return undefined
    const readyAt = nowMs()
    let backAt = 0
    let timer = 0
    const schedule = () => {
      clearTimeout(timer)
      const left = readyDelayLeft({ ios, readyAt, backAt, now: nowMs(), visible: isVisible() })
      if (left !== null) timer = setTimeout(() => setShown('ready'), left)
    }
    // вернулись (focus / visibilitychange → visible) — отсчёт заново от возврата; на iPhone скрылись (диалог / сворачивание) — таймер снимаем и ждём возврата
    const onChange = () => { if (isVisible()) { backAt = nowMs(); schedule() } else if (ios) clearTimeout(timer) }
    window.addEventListener('focus', onChange)
    document.addEventListener('visibilitychange', onChange)
    schedule()
    return () => { clearTimeout(timer); window.removeEventListener('focus', onChange); document.removeEventListener('visibilitychange', onChange) }
  }, [hold, ios])

  return hold ? 'locked' : target
}
