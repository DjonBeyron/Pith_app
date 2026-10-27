import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFillPlayer } from './fillAudio.js'
import { planFillAudio } from './fillAudioPlan.js'

// Фейковый звук: currentTime идёт по часам vitest (Date подменён fake timers), пока звук «играет»
function fakeAudio(over = {}) {
  let base = 0
  let since = null
  const a = {
    log: [],
    ended: false,
    get currentTime() { return since == null ? base : base + (Date.now() - since) / 1000 },
    set currentTime(v) { base = v; if (since != null) since = Date.now(); a.log.push(`seek ${v}`) },
    async play() { if (over.reject) throw new Error('NotAllowedError'); since = Date.now(); a.log.push('play') },
    pause() { base = a.currentTime; since = null; a.log.push(`pause ${base.toFixed(2)}`) },
  }
  return a
}

describe('createFillPlayer: склейка до слова → мяу → после', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  const steps = planFillAudio({ start: 1.03, end: 1.5, durationSec: 3 }).steps

  it('играет до слова, молчит 350 мс, продолжает с конца слова; стадии идут по порядку', async () => {
    const audio = fakeAudio()
    const stages = []
    const p = createFillPlayer({ url: 'u.mp3', steps, onStage: s => stages.push(s), makeAudio: () => audio })
    const done = p.play()
    await vi.advanceTimersByTimeAsync(1100)
    expect(stages).toEqual(['before', 'meow']) // кусок «до» (1 с) отыграл, идёт пауза
    expect(audio.log.some(l => /^pause 1\.0/.test(l))).toBe(true)
    await vi.advanceTimersByTimeAsync(400)
    expect(stages).toEqual(['before', 'meow', 'after'])
    expect(audio.log).toContain('seek 1.5') // остаток — с конца слова
    audio.ended = true
    await vi.advanceTimersByTimeAsync(100)
    await done
    expect(stages.at(-1)).toBe('done')
  })

  it('stop обрывает прогон: дальше ничего не играет и стадии не приходят', async () => {
    const audio = fakeAudio()
    const stages = []
    const p = createFillPlayer({ url: 'u.mp3', steps, onStage: s => stages.push(s), makeAudio: () => audio })
    p.play()
    await vi.advanceTimersByTimeAsync(500)
    p.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(stages).toEqual(['before'])
    expect(audio.log.filter(l => l === 'play')).toHaveLength(1)
  })

  it('повторный play начинает заново, один элемент Audio', async () => {
    const audio = fakeAudio()
    const make = vi.fn(() => audio)
    const stages = []
    const p = createFillPlayer({ url: 'u.mp3', steps, onStage: s => stages.push(s), makeAudio: make })
    p.play()
    await vi.advanceTimersByTimeAsync(300)
    p.play()
    await vi.advanceTimersByTimeAsync(100)
    expect(make).toHaveBeenCalledTimes(1)
    expect(stages).toEqual(['before', 'before'])
    expect(audio.log.filter(l => l === 'seek 0')).toHaveLength(2)
  })

  it('браузер не дал играть — стадия blocked, без исключения', async () => {
    const audio = fakeAudio({ reject: true })
    const stages = []
    const p = createFillPlayer({ url: 'u.mp3', steps, onStage: s => stages.push(s), makeAudio: () => audio })
    await p.play()
    expect(stages).toEqual(['before', 'blocked'])
  })

  it('слово первое: сразу пауза «мяу», затем остаток', async () => {
    const audio = fakeAudio()
    const stages = []
    const first = planFillAudio({ start: 0, end: 0.4, durationSec: 2 }).steps
    const p = createFillPlayer({ url: 'u.mp3', steps: first, onStage: s => stages.push(s), makeAudio: () => audio })
    p.play()
    await vi.advanceTimersByTimeAsync(10)
    expect(stages).toEqual(['meow'])
    await vi.advanceTimersByTimeAsync(400)
    expect(stages).toEqual(['meow', 'after'])
    expect(audio.log).toContain('seek 0.4')
  })
})
