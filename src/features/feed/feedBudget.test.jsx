import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromptSlotContext } from '../../shared/lib/prompts/usePromptSlotContext.js'
import { useFeedCatch } from './catch/useFeedCatch.js'
import { useFeedHint } from './useFeedHint.js'

// «Ловля слов» и подсказки ленты под единым бюджетом Пита. Статический рендер (DOM-среды нет): решение «показывать ли» принимается
// на рендере/в claim, запросы слота идут микрозадачей; эффекты (cancel, таймеры) — в браузере
const slotWith = current => ({ current, request: vi.fn(), cancel: vi.fn(), answer: vi.fn(), dismiss: vi.fn(), onSlide: vi.fn() })
const tick = () => Promise.resolve()
const host = (slot, ui) => renderToStaticMarkup(slot === undefined ? ui : <PromptSlotContext.Provider value={slot}>{ui}</PromptSlotContext.Provider>)

describe('useFeedCatch под бюджетом', () => {
  let feed
  const Probe = () => { feed = useFeedCatch(); return null }

  it('без хоста слота claim ведёт себя как раньше', () => {
    host(undefined, <Probe />)
    expect(feed.claim('m1')).toBe(true)
  })
  it('со слотом: пока слот не выбрал — задание не ставится, слот просят; после выбора — ставится и слот освобождается', async () => {
    const waiting = slotWith(null)
    host(waiting, <Probe />)
    expect(feed.claim('m1')).toBe(false)
    await tick()
    expect(waiting.request).toHaveBeenCalledWith({ id: 'catch:m1', kind: 'offer', reason: 'game_offer', legacy: true })

    const chosen = slotWith({ id: 'catch:m1', kind: 'offer' })
    host(chosen, <Probe />)
    expect(feed.claim('m1')).toBe(true)
    await tick()
    expect(chosen.answer).toHaveBeenCalledWith('shown')
    expect(feed.claim('m1')).toBe(true) // повторный claim той же фразы — без нового запроса к слоту
  })
  it('слот выбрал другую фразу — эта не ставится', () => {
    host(slotWith({ id: 'catch:other', kind: 'offer' }), <Probe />)
    expect(feed.claim('m1')).toBe(false)
  })
  it('смена слайда считается в слоте', () => {
    const slot = slotWith(null)
    host(slot, <Probe />)
    feed.onSlide('m1')
    expect(slot.onSlide).toHaveBeenCalledTimes(1)
  })
})

describe('useFeedHint под бюджетом', () => {
  const cfg = { seenKey: 'test_hint_seen', ignoredKey: 'test_hint_ignored', armAt: 1 }
  const out = []
  const Probe = () => { out.push(useFeedHint(0, cfg, { units: 5 }).showHint); return null }
  const shown = slot => { out.length = 0; host(slot, <Probe />); return out.at(-1) }

  it('без хоста слота подсказка показывается как раньше', () => {
    expect(shown(undefined)).toBe(true)
  })
  it('со слотом: показывается, только когда слот выбрал именно её', () => {
    expect(shown(slotWith(null))).toBe(false)
    expect(shown(slotWith({ id: 'hint:other', kind: 'hint' }))).toBe(false)
    expect(shown(slotWith({ id: 'hint:test_hint_seen', kind: 'hint' }))).toBe(true)
  })
})
