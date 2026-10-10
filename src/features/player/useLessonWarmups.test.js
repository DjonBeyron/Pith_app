import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { startLessonWarmups } from './useLessonWarmups.js'

// Урок без say_phrase ничего не готовит; с ним — чанк панели в простое + ранний прогрев Vosk (отдельный чанк, подставной)
const flush = () => new Promise(r => setTimeout(r, 0))
function deps() {
  const cancel = vi.fn()
  const stopIdle = vi.fn()
  return { cancel, stopIdle, idle: vi.fn(() => stopIdle), prefetchPanel: vi.fn(), loadWarm: vi.fn(async () => ({ startLessonWarm: vi.fn(() => cancel) })) }
}

describe('startLessonWarmups', () => {
  it('урок без say_phrase: ничего не греется и не подгружается (ни чанк панели, ни Vosk)', async () => {
    const d = deps()
    expect(startLessonWarmups(false, d)).toBeUndefined()
    await flush()
    expect(d.idle).not.toHaveBeenCalled(); expect(d.loadWarm).not.toHaveBeenCalled()
  })
  it('урок с say_phrase: чанк панели — в простое, ранний прогрев запускается; выход из урока отпускает всё', async () => {
    const d = deps()
    const stop = startLessonWarmups(true, d)
    await flush()
    expect(d.idle).toHaveBeenCalledWith([d.prefetchPanel]); expect(d.loadWarm).toHaveBeenCalledTimes(1)
    const mod = await d.loadWarm.mock.results[0].value
    expect(mod.startLessonWarm).toHaveBeenCalledTimes(1)
    stop()
    expect(d.stopIdle).toHaveBeenCalled(); expect(d.cancel).toHaveBeenCalledTimes(1)
  })
  it('урок закрыли, пока чанк прогрева ещё грузился — прогрев не стартует; чанк не подгрузился (офлайн) — тихо, без ошибок', async () => {
    const d = deps()
    startLessonWarmups(true, d)()
    await flush()
    const mod = await d.loadWarm.mock.results[0].value
    expect(mod.startLessonWarm).not.toHaveBeenCalled()
    const bad = deps(); bad.loadWarm = vi.fn(async () => { throw new Error('Failed to fetch dynamically imported module') })
    expect(() => startLessonWarmups(true, bad)).not.toThrow()
    await flush()
  })
  it('хук подключён в PlayerPanels одной строкой, а плеер не тянет runtime статически', () => {
    const panels = readFileSync(new URL('./PlayerPanels.jsx', import.meta.url), 'utf8')
    expect(panels).toContain('useLessonWarmups(nodes)')
    expect(panels).not.toMatch(/voskRuntime|sayLessonWarm/)
    expect(readFileSync(new URL('./useLessonWarmups.js', import.meta.url), 'utf8')).toContain("n.type === 'say_phrase'")
  })
})
