import { onTrack, track } from '../../../shared/lib/analytics/track.js'
import { FEED_LADDER } from '../../../shared/lib/analytics/eventNames.js'
import { createCollector } from './ladderCollector.js'
import { markDone } from './ladderStore.js'
import { LADDER_MIN_DONE_STEPS } from './ladderRules.js'

// Слежение за лесенкой: подписка на журнал (onTrack) → сборщик (ladderCollector.js) → одно событие feed_ladder,
// когда просмотрена последняя фраза плана либо страница уходит (pagehide). Событие дальше подхватывает модель уровня
// (levelSignals.js → сигнал 'ladder'). Лесенка считается показанной (done), если просмотрено хотя бы LADDER_MIN_DONE_STEPS
// шагов; ушёл раньше — в другой визит попробуем ещё раз (ограничено LADDER_MAX_TRIES). Возвращает остановку слежения.
let stop = null

export function startLadderTracking(plan) {
  stop?.()
  if (!plan?.length) return () => {}
  const collector = createCollector(plan)
  let off = null
  const finish = summary => {
    stop?.()
    if (!summary) return
    const { count, ...props } = summary
    track(FEED_LADDER, props)
    if (count >= LADDER_MIN_DONE_STEPS) markDone()
  }
  const onLeave = () => finish(collector.flush())
  off = onTrack((name, props) => {
    if (name === FEED_LADDER) return
    const summary = collector.handle(name, props)
    if (summary) finish(summary)
  })
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onLeave)
  const mine = () => {
    off?.()
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onLeave)
    if (stop === mine) stop = null
  }
  stop = mine
  return mine
}

// Только для тестов
export const _stopLadderTracking = () => stop?.()
