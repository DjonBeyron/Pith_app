import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import MemoryStory from './MemoryStory.jsx'
import { startStory } from './memoryStoryPlayer.js'
import { memoryStorySeen, markMemoryStorySeen } from './memoryStoryFlag.js'
import { defaultTotalMs, lineSchedule } from './memoryStoryTiming.js'
import { MEMORY_STORY } from './memoryStoryText.js'

vi.mock('../../shared/lib/analytics/track.js', () => ({ track: vi.fn() }))

// В проекте нет testing-library/jsdom: разметку проверяем через renderToStaticMarkup,
// ход рассказа (таймеры, звук, «Дальше») — на startStory с фейковыми таймерами,
// а связку компонента с ними и с аналитикой — сторожем по исходнику
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const store = {}
const lines = ['Раз.', 'Два-два.', 'Три-три-три.']

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
  vi.stubGlobal('localStorage', {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
  })
  vi.useFakeTimers()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('MemoryStory — разметка', () => {
  it('первый вход: шторка с Питом и первой строкой, «Дальше», кнопки рассказа ещё нет', () => {
    const html = renderToStaticMarkup(<MemoryStory open onDone={() => {}} />)
    expect(html).toContain('lrSheetBack')
    expect(html).toContain('memStoryPit')
    expect(html).toContain('<img')
    expect(html).toContain(MEMORY_STORY.lines[0])
    expect(html).not.toContain(MEMORY_STORY.lines[1])
    expect(html).toContain('Дальше')
    expect(html).not.toContain(MEMORY_STORY.cta)
  })
  it('флаг стоит — ничего не рендерится; вкладка скрыта (open=false) — тоже', () => {
    markMemoryStorySeen()
    expect(renderToStaticMarkup(<MemoryStory open onDone={() => {}} />)).toBe('')
    for (const k of Object.keys(store)) delete store[k]
    expect(renderToStaticMarkup(<MemoryStory open={false} onDone={() => {}} />)).toBe('')
  })
  it('флаг тот же, что у старого окна, — тем, кто его видел, рассказ не всплывает', () => {
    store.pithy_memory_intro_v1 = '1'
    expect(memoryStorySeen()).toBe(true)
    markMemoryStorySeen()
    expect(store.pithy_memory_intro_v1).toBe('1')
  })
  it('хранилище недоступно — считаем «видел» (не мучаем при каждом входе)', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('private') } })
    expect(memoryStorySeen()).toBe(true)
  })
})

describe('startStory — без озвучки', () => {
  it('строки сменяются по расписанию, в конце onEnd', () => {
    const onLine = vi.fn(); const onEnd = vi.fn()
    startStory({ lines, audioUrl: null, onLine, onEnd })
    const sched = lineSchedule(lines, defaultTotalMs(lines))
    vi.advanceTimersByTime(0)
    expect(onLine).toHaveBeenCalledWith(0)
    vi.advanceTimersByTime(sched[1].at - 1)
    expect(onLine).not.toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(1)
    expect(onLine).toHaveBeenLastCalledWith(1)
    vi.advanceTimersByTime(sched[2].at - sched[1].at)
    expect(onLine).toHaveBeenLastCalledWith(2)
    expect(onEnd).not.toHaveBeenCalled()
    vi.advanceTimersByTime(sched[2].dur)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
  it('«Дальше»: сразу последняя строка и конец, таймеры больше не стреляют', () => {
    const onLine = vi.fn(); const onEnd = vi.fn()
    const p = startStory({ lines, audioUrl: null, onLine, onEnd })
    p.skip()
    expect(onLine).toHaveBeenLastCalledWith(2)
    expect(onEnd).toHaveBeenCalledTimes(1)
    onLine.mockClear()
    vi.advanceTimersByTime(60000)
    expect(onLine).not.toHaveBeenCalled()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
  it('закрытие снимает таймеры: ни строк, ни onEnd', () => {
    const onLine = vi.fn(); const onEnd = vi.fn()
    const p = startStory({ lines, audioUrl: null, onLine, onEnd })
    onLine.mockClear()
    p.stop()
    vi.advanceTimersByTime(60000)
    expect(onLine).not.toHaveBeenCalled()
    expect(onEnd).not.toHaveBeenCalled()
  })
})

describe('startStory — с озвучкой', () => {
  const makeAudio = (over = {}) => {
    const a = { duration: 0, pause: vi.fn(), play: vi.fn(() => Promise.resolve()), ...over }
    return a
  }
  it('строки делят длительность файла (loadedmetadata → duration)', () => {
    const a = makeAudio(); const onLine = vi.fn(); const onEnd = vi.fn()
    startStory({ lines, audioUrl: 'x.mp3', onLine, onEnd, createAudio: () => a })
    expect(a.play).toHaveBeenCalled()
    a.duration = 6; a.onloadedmetadata()
    const sched = lineSchedule(lines, 6000)
    vi.advanceTimersByTime(sched[2].at)
    expect(onLine).toHaveBeenLastCalledWith(2)
    vi.advanceTimersByTime(sched[2].dur)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
  it('play() отказал — тихо переходим на таймеры без звука', async () => {
    const a = makeAudio({ play: vi.fn(() => Promise.reject(new Error('NotAllowed'))) })
    const onLine = vi.fn(); const onEnd = vi.fn()
    startStory({ lines, audioUrl: 'x.mp3', onLine, onEnd, createAudio: () => a })
    await Promise.resolve(); await Promise.resolve()
    expect(a.pause).toHaveBeenCalled()
    vi.advanceTimersByTime(defaultTotalMs(lines))
    expect(onLine).toHaveBeenLastCalledWith(2)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
  it('ошибка загрузки и «метаданные не пришли» — то же самое', () => {
    const a = makeAudio(); const onEnd = vi.fn()
    startStory({ lines, audioUrl: 'x.mp3', onLine: () => {}, onEnd, createAudio: () => a })
    a.onerror()
    vi.advanceTimersByTime(defaultTotalMs(lines))
    expect(onEnd).toHaveBeenCalledTimes(1)
    const b = makeAudio(); const onEnd2 = vi.fn()
    startStory({ lines, audioUrl: 'y.mp3', onLine: () => {}, onEnd: onEnd2, createAudio: () => b })
    vi.advanceTimersByTime(3000 + defaultTotalMs(lines))
    expect(b.pause).toHaveBeenCalled()
    expect(onEnd2).toHaveBeenCalledTimes(1)
  })
  it('закрытие останавливает звук', () => {
    const a = makeAudio()
    const p = startStory({ lines, audioUrl: 'x.mp3', onLine: () => {}, onEnd: () => {}, createAudio: () => a })
    p.stop()
    expect(a.pause).toHaveBeenCalled()
  })
})

describe('MemoryStory — связка (сторож по исходнику)', () => {
  const code = read('./MemoryStory.jsx').replace(/\/\/.*$/gm, '')
  it('событие memory_intro_open с признаком голоса', () => {
    expect(code).toContain('track(MEMORY_INTRO_OPEN, { voice: !!audioUrl })')
    expect(read('../../shared/lib/analytics/eventNames.js')).toContain("MEMORY_INTRO_OPEN = 'memory_intro_open'")
    expect(read('../../../supabase/migrations/20261027130000_memory_intro_event.sql')).toContain("'memory_intro_open'")
  })
  it('кнопка рассказа и закрытие: флаг ставится, затем onDone; звук и таймеры снимаются', () => {
    expect(code).toMatch(/function close\(\) \{\s*player\.current\?\.stop\(\)\s*markMemoryStorySeen\(\)\s*setShow\(false\)\s*onDone\?\.\(\)/)
    expect(code).toContain('onClick={close}>{cta}')
    expect(code).toContain('player.current?.skip()')
    expect(code).toMatch(/return \(\) => \{ player\.current\?\.stop\(\)/)
  })
  it('в LearnTab стоит MemoryStory вместо MemoryIntro', () => {
    const tab = read('./LearnTab.jsx')
    expect(tab).toContain('<MemoryStory open={visible}')
    expect(tab).not.toContain('MemoryIntro')
  })
})
