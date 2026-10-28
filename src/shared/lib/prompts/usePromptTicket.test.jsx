import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromptSlotContext } from './usePromptSlotContext.js'
import { usePromptTicket } from './usePromptTicket.js'

const cand = { id: 'hint:x', kind: 'hint', reason: 'ui_hint' }
function Probe() {
  const { granted } = usePromptTicket(cand, true)
  return <i data-granted={String(granted)} />
}
const withSlot = value => renderToStaticMarkup(<PromptSlotContext.Provider value={value}><Probe /></PromptSlotContext.Provider>)
const slotWith = current => ({ current, request: vi.fn(), cancel: vi.fn(), answer: vi.fn(), dismiss: vi.fn() })

// Эффекты (запрос у слота, отмена) на сервере не идут — они в браузере; здесь решение «разрешено ли показывать» на рендере
describe('usePromptTicket', () => {
  it('без хоста слота разрешено всегда (поведение как до бюджета)', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('data-granted="true"')
  })
  it('слот ещё не выбрал кандидата — не разрешено', () => {
    expect(withSlot(slotWith(null))).toContain('data-granted="false"')
    expect(withSlot(slotWith({ id: 'other', kind: 'question' }))).toContain('data-granted="false"')
  })
  it('слот выбрал именно этого кандидата — разрешено', () => {
    expect(withSlot(slotWith(cand))).toContain('data-granted="true"')
  })
})
