import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// DOM-среды нет (статический рендер): useEffect подменён на немедленный вызов, чтобы проверить подписку хука.
// Подписка на журнал подменена: listener — то, что хук повесил через onTrack
const hoisted = vi.hoisted(() => ({ listener: null, off: null }))
vi.mock('react', async importOriginal => ({ ...(await importOriginal()), useEffect: fn => { hoisted.cleanup = fn() } }))
vi.mock('../../../shared/lib/analytics/track.js', () => ({
  onTrack: fn => { hoisted.listener = fn; hoisted.off = vi.fn(() => { hoisted.listener = null }); return hoisted.off },
}))
const { PromptSlotContext } = await import('../../../shared/lib/prompts/usePromptSlotContext.js')
const { usePaceQuestion, resetPaceSession } = await import('./usePaceQuestion.js')

const slotWith = () => ({ current: null, request: vi.fn(), cancel: vi.fn() })
const Probe = () => { usePaceQuestion(); return null }
const swipe = ms => hoisted.listener('feed_swipe', { from: 'a', to: 'b', dir: 'next', ms_prev: ms })

describe('usePaceQuestion', () => {
  beforeEach(() => { hoisted.listener = null; hoisted.cleanup = null; resetPaceSession() })

  it('без хоста слота журнал не слушает', () => {
    renderToStaticMarkup(<Probe />)
    expect(hoisted.listener).toBeNull()
  })

  it('три быстрых feed_swipe → слоту уходит кандидат behavior:pace; прочие события и медленные свайпы не в счёт', () => {
    const slot = slotWith()
    renderToStaticMarkup(<PromptSlotContext.Provider value={slot}><Probe /></PromptSlotContext.Provider>)
    expect(hoisted.listener).toBeTypeOf('function')
    swipe(500)
    hoisted.listener('feed_view', { module_id: 'a', ms: 100 })
    swipe(800)
    swipe(5000) // медленный — счёт с нуля
    swipe(100); swipe(100)
    expect(slot.request).not.toHaveBeenCalled()
    swipe(100)
    expect(slot.request).toHaveBeenCalledTimes(1)
    expect(slot.request.mock.calls[0][0]).toMatchObject({ id: 'behavior:pace', reason: 'behavior', aboutPerson: true })
    // раз за сессию
    for (let i = 0; i < 30; i++) swipe(100)
    expect(slot.request).toHaveBeenCalledTimes(1)
    // размонтирование ленты снимает подписку (возврат эффекта — отписка)
    hoisted.cleanup()
    expect(hoisted.off).toHaveBeenCalled()
    expect(hoisted.listener).toBeNull()
  })
})
