import { useState } from 'react'
import { buyStreakFreeze, buyAutoFreeze } from '../../shared/api/streakApi.js'
import { refreshProfile } from '../../shared/api/profileCache.js'

export const FREEZE_COST = 2
export const AUTO_COST   = 3

// Покупка защит серии для шторки FreezeSheet — общая для окна наград и
// полноэкранного окна серии (StreakGateOverlay). Суммы и правила живут на
// сервере, здесь только состояние кнопок и человеческий текст ошибки.
export function useFreezeBuy() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run(fn, alreadyText) {
    setBusy(true)
    const res = await fn()
    if (res.ok) { setMsg(''); await refreshProfile() }
    else setMsg(res.reason === 'not_enough_tickets' ? 'Не хватает золотых билетов' : alreadyText)
    setBusy(false)
  }

  return {
    busy,
    msg,
    buyFreeze: () => run(buyStreakFreeze, 'Уже есть заморозка про запас'),
    buyAuto:   () => run(buyAutoFreeze, 'Уже активна'),
  }
}
