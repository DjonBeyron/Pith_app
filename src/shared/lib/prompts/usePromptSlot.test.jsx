import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('../analytics/track.js', () => ({ track: vi.fn() }))
vi.mock('./promptStore.js', () => ({
  loadState: vi.fn(() => ({
    sessions: 0, sessionAt: 0, slide: 0, lastSlide: null, shownSession: [], aboutPerson: 0,
    pausedKinds: {}, dismissStreak: {}, hintIgnored: {}, laterStreak: 0, laterUntil: 0, stats: {}, offKinds: {},
  })),
  write: vi.fn(),
}))

import { usePromptSlot } from './usePromptSlot.js'
import { loadState } from './promptStore.js'

// В проекте нет @testing-library/react и DOM-среды, поэтому хук проверяем статическим рендером (renderToStaticMarkup;
// эффекты на сервере не идут). Поведение очереди и события — promptSlotCore.test.js, там то же без React.
function Probe() {
  const p = usePromptSlot()
  return <i data-keys={Object.keys(p).join(',')} data-types={Object.values(p).map(v => typeof v).join(',')} />
}

describe('usePromptSlot', () => {
  it('отдаёт current и методы request/answer/dismiss/later/onSlide/setBusy', () => {
    const html = renderToStaticMarkup(<Probe />)
    expect(html).toContain('data-keys="current,request,answer,dismiss,later,onSlide,setBusy"')
    expect(html).toContain('data-types="object,function,function,function,function,function,function"') // current === null
  })
  it('состояние читается из хранилища при создании слота', () => {
    loadState.mockClear()
    renderToStaticMarkup(<Probe />)
    expect(loadState).toHaveBeenCalledTimes(1)
  })
  it('на сервере сессию не начинает (start — в эффекте при маунте)', async () => {
    const { write } = await import('./promptStore.js')
    write.mockClear()
    renderToStaticMarkup(<Probe />)
    expect(write).not.toHaveBeenCalled()
  })
})
