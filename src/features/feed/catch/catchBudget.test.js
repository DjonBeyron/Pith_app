import { describe, it, expect, vi } from 'vitest'
import { catchCandidate, catchGranted, requestCatch, consumeCatch } from './catchBudget.js'

const slotOf = current => ({ current, request: vi.fn(), answer: vi.fn(), cancel: vi.fn() })
const tick = () => Promise.resolve()

describe('catchBudget — «Ловля слов» под бюджетом Пита', () => {
  it('кандидат — предложение игры', () => {
    expect(catchCandidate('m1')).toEqual({ id: 'catch:m1', kind: 'offer', reason: 'game_offer', legacy: true })
  })
  it('без слота разрешено всегда, ничего не просит', () => {
    const pending = { id: null }
    expect(catchGranted(null, 'm1')).toBe(true)
    requestCatch(null, 'm1', pending)
    consumeCatch(null, 'm1', pending)
    expect(pending.id).toBeNull()
  })
  it('со слотом разрешено, только если выбрана именно эта фраза', () => {
    expect(catchGranted(slotOf(null), 'm1')).toBe(false)
    expect(catchGranted(slotOf({ id: 'catch:m2' }), 'm1')).toBe(false)
    expect(catchGranted(slotOf({ id: 'catch:m1' }), 'm1')).toBe(true)
  })
  it('просьба идёт один раз на фразу; прошлую ждущую фразу снимает', async () => {
    const slot = slotOf(null)
    const pending = { id: null }
    requestCatch(slot, 'm1', pending)
    requestCatch(slot, 'm1', pending)
    await tick()
    expect(slot.request).toHaveBeenCalledTimes(1)
    requestCatch(slot, 'm2', pending)
    await tick()
    expect(slot.cancel).toHaveBeenCalledWith('catch:m1')
    expect(slot.request).toHaveBeenLastCalledWith(catchCandidate('m2'))
  })
  it('задание поставлено — answer("shown") освобождает слот', async () => {
    const slot = slotOf({ id: 'catch:m1' })
    const pending = { id: 'm1' }
    consumeCatch(slot, 'm1', pending)
    await tick()
    expect(slot.answer).toHaveBeenCalledWith('shown')
    expect(pending.id).toBeNull()
  })
})
