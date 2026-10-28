import { describe, it, expect, vi } from 'vitest'
import { createMouthSync } from './mouthSync.js'
import { envelopeLevels } from '../../../shared/lib/audioEnvelope.js'
import { setMouth } from './mouthDriver.js'

// «Живой Пит v2» в mouthSync: вместо closed/half/open в apply приходят коды Rhubarb
const timings = [
  { word: 'мама', start: 0.1, end: 0.6 },
  { word: 'папа', start: 1.0, end: 1.5 },
]

function harness({ lv = null, onWord = vi.fn() } = {}) {
  const audio = { currentTime: 0, paused: false, seeking: false, readyState: 4 }
  let frame = null
  let wall = 0
  const codes = []
  const sync = createMouthSync(audio, timings, c => codes.push(c), {
    raf: f => { frame = f; return 1 }, caf: () => { frame = null }, timers: globalThis, now: () => wall, isHidden: () => false,
    v2: { lv, onWord },
  })
  const step = (t, dt = 16) => { wall += dt; audio.currentTime = t; const f = frame; frame = null; f?.() }
  return { audio, sync, codes, step, onWord }
}

describe('mouthSync v2 — рот кодами по буквам', () => {
  it('в паузах X, в слове — коды по буквам («мама»: A D A D), конец — X', () => {
    const h = harness()
    h.audio.currentTime = 0.05
    h.sync.start()
    expect(h.codes).toEqual(['X'])
    const seen = []
    for (let t = 0.1; t < 0.6; t += 0.02) { h.step(t); seen.push(h.codes.at(-1)) }
    const uniq = seen.filter((c, i) => c !== seen[i - 1])
    expect(uniq).toEqual(['A', 'D', 'A', 'D'])
    h.step(0.8)
    expect(h.codes.at(-1)).toBe('X')
    h.sync.stop()
    expect(h.codes.at(-1)).toBe('closed') // остановка закрывает рот обычной формой (маскот: setMouth → X)
  })

  it('гейт по огибающей: тихие окна — X, средние — «полуоткрытая» версия (D→C), громкие — код как есть', () => {
    // hz 10: окна по 0,1 с; «мама» 0,1…0,6 — окно 1 (0,1…0,2) тихое, 2 (0,2…0,3) среднее, остальные громкие
    const lv = envelopeLevels({ hz: 10, data: '0' + '0' + '5' + 'f'.repeat(20) })
    const h = harness({ lv })
    h.audio.currentTime = 0.05
    h.sync.start()
    h.step(0.15)
    expect(h.codes.at(-1)).toBe('X')
    const none = harness()
    none.audio.currentTime = 0.05
    none.sync.start()
    none.step(0.15)
    expect(none.codes.at(-1)).toBe('A')       // без огибающей — только буквы
    const seen = new Set()
    for (let t = 0.1; t < 0.6; t += 0.02) { h.step(t); seen.add(h.codes.at(-1)) }
    expect(seen.has('D')).toBe(true)          // громкая часть — «а» как есть
  })

  it('onWord — один раз на границе слова, с индексом слова', () => {
    const h = harness()
    h.audio.currentTime = 0.1
    h.sync.start()
    for (let t = 0.12; t < 0.6; t += 0.04) h.step(t)
    expect(h.onWord.mock.calls).toEqual([[0]])
    h.step(1.1)
    expect(h.onWord.mock.calls).toEqual([[0], [1]])
  })

  it('пауза / перемотка / нет данных → X; пошло время — снова по буквам; setTimings перестраивает дорожку', () => {
    const h = harness()
    h.audio.currentTime = 0.1
    h.sync.start()
    h.audio.paused = true
    h.step(0.2)
    expect(h.codes.at(-1)).toBe('X')
    h.audio.paused = false
    h.step(0.25)
    expect(h.codes.at(-1)).not.toBe('X')
    h.sync.setTimings([{ word: 'у', start: 0, end: 5 }])
    h.step(2)
    expect(h.codes.at(-1)).toBe('F')
  })
})

// DOM-подобные элементы: маскот (data-skin) и обычный кот
function fakeEl(attrs) {
  const a = { ...attrs }
  return { a, getAttribute: k => a[k] ?? null, setAttribute(k, v) { a[k] = String(v) }, removeAttribute(k) { delete a[k] }, hasAttribute: k => k in a, querySelector: () => null }
}

describe('setMouth — коды Rhubarb и три старые формы', () => {
  it('у обычного кота код сворачивается в closed / half / open (data-mouth), data-vis не заводится', () => {
    const cat = fakeEl({ 'data-mouth': 'closed' })
    setMouth(cat, 'D')
    expect(cat.a['data-mouth']).toBe('open')
    setMouth(cat, 'B')
    expect(cat.a['data-mouth']).toBe('half')
    setMouth(cat, 'A')
    expect(cat.a['data-mouth']).toBe('closed')
    setMouth(cat, 'open')
    expect(cat.a['data-mouth']).toBe('open')
    expect(cat.a['data-vis']).toBeUndefined()
  })

  it('у маскота код хранится в data-vis (точная форма), data-mouth — свёртка; повтор того же кода ничего не пишет', () => {
    const pit = fakeEl({ 'data-mouth': 'closed', 'data-skin': 'kit', 'data-face': 'base' })
    setMouth(pit, 'E')
    expect(pit.a['data-vis']).toBe('E')
    expect(pit.a['data-mouth']).toBe('open')
    const before = JSON.stringify(pit.a)
    setMouth(pit, 'E')
    expect(JSON.stringify(pit.a)).toBe(before)
    setMouth(pit, 'X')
    expect(pit.a['data-vis']).toBe('X')
    // после кодов обычная форма (запасной путь mouthDriver) снимает data-vis и применяется даже при совпадении свёртки
    setMouth(pit, 'B')
    setMouth(pit, 'half')
    expect(pit.a['data-vis']).toBeUndefined()
    expect(pit.a['data-mouth']).toBe('half')
  })
})
