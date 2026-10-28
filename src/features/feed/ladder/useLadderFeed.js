import { useEffect, useMemo, useState } from 'react'
import { localToday } from '../../review/reviewDecks.js'
import { decideLadder, readLadderEnv } from './ladderGate.js'
import { putLadderFirst } from './ladderPlan.js'
import { ensureLadder, markShown } from './ladderStore.js'
import { startLadderTracking } from './ladderTrack.js'
import { loadState } from '../../../shared/lib/prompts/promptStore.js'

// Лесенка второго визита в ленте (ladder/): ставит до 5 фраз по нарастанию сложности первыми, остальные — как были.
// ranked — не начатые фразы после ранжирования (useFeedModules). Решение принимается ОДИН раз за загрузку страницы —
// как только список непустой: потом порядок не меняется (игра в «пересортировку» под пальцем сдвинула бы слайды).
// Невидима: ни реплик Пита, ни интерфейса. Состояние — ladderStore.js, итог — событие feed_ladder (ladderTrack.js).
export function useLadderFeed(ranked) {
  // Первая загрузка на устройстве записывает firstDay; визит №2+ без записи — старый пользователь (done)
  useEffect(() => { ensureLadder({ today: localToday(), sessions: loadState().sessions }) }, [])

  const [plan, setPlan] = useState(null) // null — ещё не решали; [] — лесенки нет; иначе [{ id, difficulty }]
  if (plan === null && ranked.length > 0) setPlan(decideLadder(ranked, readLadderEnv()))

  useEffect(() => {
    if (!plan?.length) return undefined
    markShown(plan, localToday())
    return startLadderTracking(plan)
  }, [plan])

  return useMemo(() => putLadderFirst(ranked, plan), [ranked, plan])
}
