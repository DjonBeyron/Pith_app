import { describe, it, expect } from 'vitest'
import { createProgressTimeline, LAST_CAP, END_MS } from './sceneProgressModel.js'
import { RING_TAIL_MS } from './sceneProgressPlan.js'

// Якорь по реальному старту файла и запас RING_TAIL_MS — вынесено из sceneProgress.test.js (лимит 250 строк)
describe('sceneProgressModel — якорь по реальному старту файла', () => {
  it('якорь: то же состояние playing ещё раз, когда файл реально зазвучал — конец отрезка сдвигается на задержку старта, без скачка', () => {
    const D = [3000, 3000]
    const tl = createProgressTimeline()
    tl.onState({ status: 'playing', index: 0, run: 1 }, { durations: D, now: 0 })
    const before = tl.value(300)
    const r = tl.onState({ status: 'playing', index: 0, run: 1 }, { durations: D, now: 300 }) // файл пошёл через 300 мс
    expect(r.from).toBeCloseTo(before, 9) // продолжаем с текущего значения
    const end0 = D[0] / (D[0] + D[1])
    expect(tl.value(3000)).toBeLessThan(end0) // к «старому» концу ещё не доехали
    expect(tl.value(3300)).toBeGreaterThanOrEqual(end0 - 0.002) // к концу от реального старта — доехали
    // Последняя реплика: якорь сдвигает приход к LAST_CAP ровно на задержку
    tl.onState({ status: 'playing', index: 1, run: 2 }, { durations: D, now: 3300 })
    tl.onState({ status: 'playing', index: 1, run: 2 }, { durations: D, now: 3500 })
    expect(tl.value(6300)).toBeLessThan(LAST_CAP)
    expect(tl.value(6500)).toBeCloseTo(LAST_CAP, 3)
  })

  it('iPhone-хронометраж (трасса 2026-10-21): с запасом RING_TAIL_MS кольцо не стоит ни на стыке реплик, ни перед ended', () => {
    // state → anchor (+380 мс, остаток 3605) → ended/state 2 (+4060) → anchor (+4460, остаток 3109) → ended (+7670)
    const tl = createProgressTimeline()
    const events = [
      [0, { status: 'playing', index: 0 }, [3605, 3109]],
      [380, { status: 'playing', index: 0 }, [3605 + RING_TAIL_MS, 3109]],
      [4060, { status: 'playing', index: 1 }, [3605 + RING_TAIL_MS, 3109]],
      [4460, { status: 'playing', index: 1 }, [3605 + RING_TAIL_MS, 3109 + RING_TAIL_MS]],
      [7670, { status: 'ended', index: 1 }, [3605, 3109]],
    ]
    let prev = 0, flat = 0, maxFlat = 0
    events.forEach(([now, st, d], i) => {
      tl.onState({ ...st, run: st.index + 1 }, { durations: d, now })
      const until = i + 1 < events.length ? events[i + 1][0] : now + END_MS
      // между событиями значение растёт всё время (шаг 10 мс): модель хранит только текущий отрезок, поэтому семплируем до следующего события
      for (let t = now; t <= until; t += 10) { const v = tl.value(t); expect(v).toBeGreaterThanOrEqual(prev - 1e-9); flat = v - prev > 1e-6 ? 0 : flat + 10; maxFlat = Math.max(maxFlat, flat); prev = v }
    })
    expect(maxFlat).toBeLessThanOrEqual(30)
    expect(tl.value(7670 + END_MS)).toBe(1)
  })

})
