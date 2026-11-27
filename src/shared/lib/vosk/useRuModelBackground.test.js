import { describe, it, expect, vi } from 'vitest'
import { scheduleRuDownload, RU_BG_DELAY_MS } from './useRuModelBackground.js'

describe('scheduleRuDownload', () => {
  it('через паузу запускает русскую загрузку; отмена останавливает её', () => {
    vi.useFakeTimers()
    const start = vi.fn(), abort = vi.fn()
    const cancel = scheduleRuDownload(start, abort)
    expect(start).not.toHaveBeenCalled()
    vi.advanceTimersByTime(RU_BG_DELAY_MS)
    expect(start).toHaveBeenCalledWith({ lang: 'ru', card: true })
    cancel()
    expect(abort).toHaveBeenCalledWith('ru')
    vi.useRealTimers()
  })
  it('отмена до паузы — загрузка не стартует', () => {
    vi.useFakeTimers()
    const start = vi.fn(), abort = vi.fn()
    scheduleRuDownload(start, abort)()
    vi.advanceTimersByTime(RU_BG_DELAY_MS * 2)
    expect(start).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
