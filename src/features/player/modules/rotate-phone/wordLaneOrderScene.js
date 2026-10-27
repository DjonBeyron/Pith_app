import { ENTER_Y, EXIT_Y, SPEED } from './wordLaneTimeline.js'
import { createOrderGame, stepOrder, tapLane } from './wordLaneOrder.js'
import { snapPill, missPill } from './wordLaneSnap.js'

// Сцена раунда «Порядок» для движка пилюль (useWordLanePills): на каждую подсказку из wordLaneOrder выкатывается по пилюле в каждой дорожке, они едут как весь конвейер (композитор), а тапы по
// дорожкам (api.tap) отвечают заливкой и щелчком верной пилюле, дрожью неверной и кольцом-подсказкой на верной после нескольких ошибок. Не успел — пилюли серые и уходят вниз.
// fx: prompt(i) — выкатилась подсказка номер i, say(parts) — диктор называет подсказку, win(order, rect) — верный тап, miss() — неверный, fail({ order, lost }) — не успел, finished() — раунд закончен.
const HINT_RING_MS = 1600

export function runOrderScene({ pool, scene, fxRef }) {
  const { prompts, lanes, count } = scene
  const g = createOrderGame({ prompts, lanes })
  const t0 = performance.now()
  const sets = [] // подсказка → { spawnAt, pills: Map(дорожка → номер в пуле), taken: Set(дорожек) }
  const timers = []
  let raf = 0
  const cur = () => sets.at(-1)

  const handle = events => {
    for (const e of events) {
      if (e.type === 'spawn') {
        const set = { spawnAt: g.spawnAt, pills: new Map(), taken: new Set() }
        for (const lane of e.prompt.slots ?? Array.from({ length: count }, (_, k) => k)) { // «Различи»: пилюли только в дорожках со словами
          const k = pool.take(lane, { atMs: performance.now() - t0 - g.spawnAt })
          if (k != null) set.pills.set(lane, k)
        }
        sets.push(set)
        fxRef.current?.prompt?.(g.i) // дорожки «Различи» подписаны по-разному на каждую подсказку
      } else if (e.type === 'say') fxRef.current?.say?.(e.parts)
      else if (e.type === 'fail') {
        for (const [lane, k] of cur().pills) if (!cur().taken.has(lane)) { pool.attr(k, 'data-fail'); pool.hint(k, '0', null) }
        fxRef.current?.fail?.({ order: true, lost: e.lost })
      } else if (e.type === 'done') fxRef.current?.finished?.()
    }
  }

  const tick = now => {
    const t = now - t0
    handle(stepOrder(g, t))
    for (const set of [...sets]) { // ушла за нижний край — пилюли в пул
      if (ENTER_Y + (SPEED * (t - set.spawnAt)) / 1000 < EXIT_Y) continue
      set.pills.forEach(k => pool.give(k))
      sets.splice(sets.indexOf(set), 1)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  const api = {
    tap(lane) {
      const set = cur()
      for (const e of tapLane(g, lane, performance.now() - t0)) {
        const k = set?.pills.get(e.lane)
        if (e.type === 'ok') {
          set.taken.add(e.lane)
          if (k != null) { pool.attr(k, 'data-lock'); pool.paintFill(k, 1); snapPill(pool.el(k), e.lane) }
          fxRef.current?.win?.(e.step - 1, k != null ? pool.el(k).getBoundingClientRect() : null)
        } else if (e.type === 'wrong') {
          if (k != null) missPill(pool.el(k))
          const want = set?.pills.get(e.expected)
          if (e.hint && want != null) { pool.attr(want, 'data-hint'); timers.push(setTimeout(() => pool.attr(want, 'data-hint', false), HINT_RING_MS)) }
          fxRef.current?.miss?.()
        } else if (e.type === 'next') {
          set.pills.forEach((kk, ln) => { if (!set.taken.has(ln)) { pool.give(kk); set.pills.delete(ln) } }) // раунд пошёл дальше — лишние пилюли подсказки убираем
        } else if (e.type === 'done') fxRef.current?.finished?.()
      }
    },
  }
  return { api, stop() { cancelAnimationFrame(raf); timers.forEach(clearTimeout) } }
}
