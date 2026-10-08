import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installFakeDom } from './posterTestDom.js'

// Захват постера при «чёрном» кадре декодера (Android): повтор на том же
// времени после ожидания презентации, затем другие времена, в конце — null
const black = { fn: () => false }
vi.mock('../../shared/lib/frameBlack.js', async orig => {
  const real = await orig()
  return { ...real, frameLooksBlack: v => black.fn(v) }
})
vi.mock('../../shared/lib/debug.js', () => ({ pLog: vi.fn() }))
const { capturePosterFrame } = await import('../../shared/lib/videoFrame.js')
const { pLog } = await import('../../shared/lib/debug.js')

let dom = null
beforeEach(() => { vi.useFakeTimers(); pLog.mockClear() })
afterEach(() => { dom?.restore(); dom = null; vi.useRealTimers() })

// loadeddata с известными размерами; seeked на каждую перемотку
const plan = v => setTimeout(() => {
  v.videoWidth = 320; v.videoHeight = 240; v.duration = 10
  v.fire('loadeddata')
  let last = v.currentTime
  const poll = setInterval(() => {
    if (v.currentTime !== last) { last = v.currentTime; setTimeout(() => v.fire('seeked'), 20) }
  }, 5)
  v.stopPoll = () => clearInterval(poll)
}, 20)

describe('capturePosterFrame — защита от чёрного кадра', () => {
  it('не чёрный сразу — снимает на нулевом времени без перемоток', async () => {
    black.fn = () => false
    dom = installFakeDom([plan])
    const p = capturePosterFrame('blob:v', 4000)
    await vi.advanceTimersByTimeAsync(100)
    expect(await p).toMatch(/^blob:poster-/)
    expect(dom.created[0].seeks).toBe(0)
  })

  it('чёрный на 0, нормальный после ожидания презентации — то же время, без перемотки', async () => {
    let calls = 0
    black.fn = () => ++calls === 1
    dom = installFakeDom([plan])
    const p = capturePosterFrame('blob:v', 4000)
    await vi.advanceTimersByTimeAsync(400)
    expect(await p).toMatch(/^blob:poster-/)
    expect(dom.created[0].seeks).toBe(0)
    expect(pLog.mock.calls.some(c => String(c[0]).includes('кадр чёрный — повтор @0.00'))).toBe(true)
  })

  it('чёрный на 0 дважды — берёт кадр с 0.1 с и пишет это в лог', async () => {
    let calls = 0
    black.fn = () => ++calls <= 2
    dom = installFakeDom([plan])
    const p = capturePosterFrame('blob:v', 4000)
    await vi.advanceTimersByTimeAsync(600)
    expect(await p).toMatch(/^blob:poster-/)
    expect(dom.created[0].currentTime).toBe(0.1)
    expect(pLog.mock.calls.some(c => String(c[0]).includes('повтор @0.10'))).toBe(true)
  })

  it('все времена чёрные — null, а не чёрный постер', async () => {
    black.fn = () => true
    dom = installFakeDom([plan])
    const p = capturePosterFrame('blob:v', 4000)
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toBeNull()
    expect(dom.created[0].seeks).toBe(4) // 0.1, 0.3, 0.6, 5
    expect(dom.canvasCalls).toBe(0)
  })
})
