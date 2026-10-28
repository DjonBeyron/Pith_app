import { describe, it, expect } from 'vitest'
import { createCollector } from './ladderCollector.js'

const plan = [
  { id: 'a', difficulty: 1 }, { id: 'b', difficulty: 1 }, { id: 'c', difficulty: 2 },
  { id: 'd', difficulty: 2 }, { id: 'e', difficulty: 3 },
]
const view = (c, id, ms) => c.handle('feed_view', { module_id: id, ms })

describe('createCollector — итог лесенки', () => {
  it('всё спокойно до сложной: top 3, трудности нет', () => {
    const c = createCollector(plan)
    for (const id of 'abcd') expect(view(c, id, 9000)).toBeNull()
    expect(view(c, 'e', 12000)).toEqual({ count: 5, steps: '1:9000:0,1:9000:0,2:9000:0,2:9000:0,3:12000:0', top: 3, hard: 0 })
  })

  it('быстро и с переводом на средних: top 1, трудно с сложности 2', () => {
    const c = createCollector(plan)
    view(c, 'a', 8500); view(c, 'b', 9100)
    c.handle('feed_reveal', { module_id: 'c' }); view(c, 'c', 1500)
    c.handle('feed_phrase_open', { module_id: 'd' }); view(c, 'd', 1200)
    const sum = view(c, 'e', 1800)
    expect(sum).toEqual({ count: 5, steps: '1:8500:0,1:9100:0,2:1500:1,2:1200:1,3:1800:0', top: 1, hard: 2 })
  })

  it('быстрый пролёт без признаков трудности — просто не считается «спокойным» (top не растёт)', () => {
    const c = createCollector(plan)
    view(c, 'a', 9000); view(c, 'b', 9000); view(c, 'c', 3000); view(c, 'd', 7999)
    const sum = view(c, 'e', 500)
    expect(sum).toMatchObject({ top: 1, hard: 0 })
  })

  it('все признаки на лёгких, спокойно досмотрел сложную: трудность не выше top — шум, hard 0', () => {
    const c = createCollector(plan)
    c.handle('feed_slow', { module_id: 'a', on: true })
    view(c, 'a', 3000); view(c, 'b', 3000); view(c, 'c', 3000); view(c, 'd', 3000)
    expect(view(c, 'e', 15000)).toMatchObject({ top: 3, hard: 0 })
  })

  it('замедление: on true — признак трудности, on false (отпустил) — нет', () => {
    const c = createCollector(plan)
    c.handle('feed_slow', { module_id: 'c', on: false })
    for (const id of 'abcd') view(c, id, 9000)
    expect(view(c, 'e', 9000)).toMatchObject({ top: 3, hard: 0 })
    const c2 = createCollector(plan)
    c2.handle('feed_slow', { module_id: 'c', on: true })
    for (const id of 'abcd') view(c2, id, 9000)
    expect(view(c2, 'e', 9000)).toMatchObject({ top: 3, hard: 0 }) // c трудная, но top = 3 выше — шум
    const c3 = createCollector(plan)
    c3.handle('feed_slow', { module_id: 'e', on: true })
    for (const id of 'abcd') view(c3, id, 9000)
    expect(view(c3, 'e', 9000)).toMatchObject({ top: 2, hard: 3 })
  })

  it('чужие фразы и события не учитываются', () => {
    const c = createCollector(plan)
    expect(view(c, 'other', 9000)).toBeNull()
    expect(c.handle('feed_swipe', { from: 'a', to: 'b', ms_prev: 9000 })).toBeNull()
    expect(c.handle('feed_reveal', { module_id: 'other' })).toBeNull()
    expect(c.flush()).toBeNull() // ни одного просмотра плана
  })

  it('возврат на фразу копит время суммой; итог отдаётся один раз', () => {
    const c = createCollector([{ id: 'a', difficulty: 1 }, { id: 'b', difficulty: 2 }])
    view(c, 'a', 5000)
    view(c, 'a', 4000)
    const sum = view(c, 'b', 9000)
    expect(sum).toMatchObject({ steps: '1:9000:0,2:9000:0', top: 2 })
    expect(view(c, 'b', 9000)).toBeNull()
    expect(c.flush()).toBeNull()
  })

  it('flush: страница уходит на середине — итог по просмотренному, один раз', () => {
    const c = createCollector(plan)
    view(c, 'a', 9000)
    c.handle('feed_reveal', { module_id: 'b' }); view(c, 'b', 2000)
    expect(c.flush()).toEqual({ count: 2, steps: '1:9000:0,1:2000:1', top: 1, hard: 0 })
    expect(c.flush()).toBeNull()
    expect(view(c, 'c', 9000)).toBeNull()
  })
})
