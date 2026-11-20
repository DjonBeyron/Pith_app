import { describe, it, expect, vi } from 'vitest'
import { startStandMic, restartStandMic, leaveStandMic, STAND_CFG } from './standStart.js'

// Микрофон стенда — тот же путь, что в игре (v3.3.304): «Старт» = startGameAudio с пустым планом, оживление = restartGameAudio, выход = leaveGameMic + endGameAudio.
describe('микрофон стенда идёт путём игры', () => {
  it('«Старт» зовёт startGameAudio с микрофоном и пустым планом; ответ — mic / settled / needsTap', async () => {
    const start = vi.fn(() => Promise.resolve({ mic: 'granted', settled: { waitedMs: 130, interrupts: 0, ctx: 'running' }, needsTap: false }))
    const r = await startStandMic({ start })
    expect(start).toHaveBeenCalledWith({ cfg: STAND_CFG, audioSrc: null, lines: null, mic: true })
    expect(r).toEqual({ mic: 'granted', settled: { waitedMs: 130, interrupts: 0, ctx: 'running' }, needsTap: false })
    expect(STAND_CFG).toMatchObject({ chunks: [], confusers: [], translations: [], hasAudio: false })
  })
  it('старт упал или бросил — mic unavailable, без исключения', async () => {
    expect((await startStandMic({ start: () => Promise.reject(new Error('x')) })).mic).toBe('unavailable')
    expect((await startStandMic({ start: () => { throw new Error('y') } })).mic).toBe('unavailable')
  })
  it('оживление: restartGameAudio в режиме голоса, start — тот же startGameAudio; итог — строка для standMicHealth', async () => {
    const start = vi.fn(() => Promise.resolve({ mic: 'granted' }))
    const restart = vi.fn(async ({ start: s }) => { await s({ renewed: true }); return { ok: true, mic: 'granted' } })
    expect(await restartStandMic({ why: 'тест', restart, start })).toBe('granted')
    expect(restart).toHaveBeenCalledWith(expect.objectContaining({ voice: true, why: 'тест' })); expect(start).toHaveBeenCalledWith({ cfg: STAND_CFG, audioSrc: null, lines: null }, { renewed: true })
    expect(await restartStandMic({ restart: async () => ({ ok: false, mic: 'denied' }), start })).toBe('denied')
    expect(await restartStandMic({ restart: () => { throw new Error('z') }, start })).toBe('unavailable')
  })
  it('выход: сначала тип сессии возвращается (endGameAudio), потом поток уходит (leaveGameMic)', () => {
    const order = []
    leaveStandMic({ end: () => order.push('end'), leave: why => order.push(`leave:${why}`) })
    expect(order).toEqual(['end', 'leave:выход из стенда'])
  })
})
