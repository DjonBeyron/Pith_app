import { useState, useEffect } from 'react'
import { fetchUserStats, peekUserStats } from '../../shared/api/ratingStatsApi.js'

// Данные попапа игрока: { res, retry }. res === null — идёт загрузка, иначе
// { state: 'ok' | 'missing' | 'denied' | 'error', stats }. Свежий кэш отдаётся
// сразу (без каркаса). Попап монтируется заново на каждого игрока (key=userId).
export function useUserStats(userId) {
  const [res, setRes] = useState(() => peekUserStats(userId))
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (tick === 0 && peekUserStats(userId)) return undefined
    let alive = true
    fetchUserStats(userId, { force: tick > 0 }).then(r => { if (alive) setRes(r) })
    return () => { alive = false }
  }, [userId, tick])

  const retry = () => { setRes(null); setTick(t => t + 1) }
  return { res, retry }
}
