import { describe, it, expect, vi } from 'vitest'
import { startLessonOptimistic } from './launchStart.js'

const calls = () => { const log = []; return { log, open: () => log.push('open'), ok: r => log.push(['ok', r]), deny: r => log.push(['deny', r]), refresh: () => log.push('refresh') } }

describe('startLessonOptimistic', () => {
  it('плеер открывается ДО ответа сервера; ok → профиль обновлён и ok()', async () => {
    const c = calls()
    let resolve
    const api = vi.fn(() => new Promise(r => { resolve = r }))
    const p = startLessonOptimistic('L', { ...c, api })
    expect(c.log).toEqual(['open'])
    expect(api).toHaveBeenCalledWith('L')
    resolve({ ok: true, energy: 2 })
    await expect(p).resolves.toEqual({ ok: true, energy: 2 })
    expect(c.log).toEqual(['open', 'refresh', ['ok', { ok: true, energy: 2 }]])
  })

  it('отказ сервера (нет энергии) → deny(res): плеер уже открыт, его закрывает вызывающий; профиль не трогаем', async () => {
    const c = calls()
    const res = await startLessonOptimistic('L', { ...c, api: async () => ({ ok: false, next_at: 't' }) })
    expect(res).toEqual({ ok: false, next_at: 't' })
    expect(c.log).toEqual(['open', ['deny', { ok: false, next_at: 't' }]])
  })

  it('ошибка RPC — урок продолжается, плеер не закрывается', async () => {
    const c = calls()
    const res = await startLessonOptimistic('L', { ...c, api: async () => { throw new Error('net') } })
    expect(res).toEqual({ ok: true })
    expect(c.log).toEqual(['open'])
  })
})
