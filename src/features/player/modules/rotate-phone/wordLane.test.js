import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  SLOTS, LANES_X, FILL_AT, LISTEN_MS, LISTEN_ANCHORS, FILL_MS, DROP_MS, LANES_MS, TURN_MS, LINE_END_Y, LINE_START_Y,
  frontAtListen, stepSpeakFront, speakTarget, kickBack, HOLD_GAP,
} from './wordLaneTimeline.js'
import { analyzeHeard, wordGrammar } from './wordLaneMatch.js'
import { readWordLane, DEMO_WORD } from './wordLaneConfig.js'
import { createWordListener } from './wordLaneListen.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('раскладка: шахматный порядок и расписание', () => {
  it('слои идут слева вниз направо, каждый на своей дорожке', () => {
    expect(SLOTS.map(s => s.x)).toEqual(LANES_X)
    expect(SLOTS[0].y).toBeLessThan(SLOTS[1].y)
    expect(SLOTS[1].y).toBeLessThan(SLOTS[2].y)
  })

  it('голова линии доходит до слоя ровно в момент его заливки', () => {
    FILL_AT.forEach((t, k) => expect(frontAtListen(t)).toBeCloseTo(SLOTS[k].y, 5))
    expect(frontAtListen(0)).toBe(LINE_START_Y)
    expect(frontAtListen(LISTEN_MS)).toBe(LINE_END_Y)
  })

  it('между заливками хватает времени на саму заливку и паузу', () => {
    expect(FILL_AT[1] - FILL_AT[0]).toBeGreaterThan(FILL_MS)
    expect(FILL_AT[2] - FILL_AT[1]).toBeGreaterThan(FILL_MS)
  })

  it('голова только движется вперёд', () => {
    let prev = -1
    for (let t = 0; t <= LISTEN_MS; t += 50) { const y = frontAtListen(t); expect(y).toBeGreaterThanOrEqual(prev); prev = y }
    expect(LISTEN_ANCHORS.at(-1)[1]).toBe(LINE_END_Y)
  })
})

describe('линия ученика подстраивается под голос', () => {
  it('стоит перед ближайшим пустым слоем и не заходит за него', () => {
    let f = LINE_START_Y
    for (let i = 0; i < 600; i++) f = stepSpeakFront({ front: f, dt: 0.05, hits: 0 })
    expect(f).toBeCloseTo(SLOTS[0].y - HOLD_GAP, 5)
  })

  it('принятое слово — цель смещается к следующему слою; три слова — линия уходит за экран', () => {
    expect(speakTarget(1)).toBeCloseTo(SLOTS[1].y - HOLD_GAP, 5)
    expect(speakTarget(3)).toBe(LINE_END_Y)
    let f = SLOTS[2].y - HOLD_GAP
    for (let i = 0; i < 200; i++) f = stepSpeakFront({ front: f, dt: 0.05, hits: 3 })
    expect(f).toBe(LINE_END_Y)
  })

  it('после слова линия быстрее, чем в ожидании', () => {
    const slow = stepSpeakFront({ front: 30, dt: 0.1, hits: 1 })
    const fast = stepSpeakFront({ front: 30, dt: 0.1, hits: 1, caught: true })
    expect(fast).toBeGreaterThan(slow)
  })

  it('чужое слово отодвигает голову назад, но не выше начала линии; цель выше головы — идёт назад', () => {
    expect(kickBack(40)).toBeLessThan(40)
    expect(kickBack(LINE_START_Y + 1)).toBe(LINE_START_Y)
    expect(stepSpeakFront({ front: 60, dt: 0.1, hits: 0 })).toBeLessThan(60)
  })
})

describe('что услышал Vosk', () => {
  it('считает повторы слова и чужие слова', () => {
    expect(analyzeHeard('try try try', 'try')).toEqual({ hits: 3, misses: 0 })
    expect(analyzeHeard('try [unk] try', 'try')).toEqual({ hits: 2, misses: 1 })
    expect(analyzeHeard('', 'try')).toEqual({ hits: 0, misses: 0 })
    expect(analyzeHeard('Try, try', 'try').hits).toBe(2) // регистр и знаки не мешают
  })

  it('пока идёт речь, последнее слово ещё может измениться — промахом не считается', () => {
    expect(analyzeHeard('try [unk]', 'try', false)).toEqual({ hits: 1, misses: 0 })
    expect(analyzeHeard('try [unk]', 'try', true)).toEqual({ hits: 1, misses: 1 })
  })

  it('фраза из двух слов — одно попадание', () => {
    expect(analyzeHeard('get up get up', 'get up').hits).toBe(2)
  })

  it('словарь: все последовательности длиной 1–3 из «слово / не то» плюс [unk]', () => {
    const g = JSON.parse(wordGrammar('try'))
    expect(g).toContain('try try try')
    expect(g).toContain('try [unk] try')
    expect(g.at(-1)).toBe('[unk]')
    expect(g.length).toBe(2 + 4 + 8 + 1)
    expect(JSON.parse(wordGrammar('try', 1))).toEqual(['try', '[unk]', '[unk]'])
    expect(wordGrammar('')).toBeNull()
  })
})

describe('данные ноды', () => {
  it('пустая нода играет встроенным словом, заполненная — своим', () => {
    expect(readWordLane({})).toMatchObject({ word: DEMO_WORD.word, translation: DEMO_WORD.translation, isDemo: true })
    expect(readWordLane({ word: ' cat ', translation: 'кот', content: 'Привет' })).toMatchObject({ word: 'cat', translation: 'кот', title: 'Привет', isDemo: false })
    expect(readWordLane({ word: 'cat' }).translation).toBe('') // чужой перевод демо-слова к своему слову не липнет
  })
})

describe('слушатель: счёт копится по заходам', () => {
  function fakeListen(script) {
    const calls = []
    const listen = async (model, grammar, cb, opts) => {
      calls.push({ grammar, opts })
      const step = script.shift()
      queueMicrotask(() => { cb.onReady?.(); step.partials?.forEach(p => cb.onPartial(p)); cb.onResult(step.result, { words: step.words ?? [] }) })
      return { stop() {}, cancel() {} }
    }
    return { listen, calls }
  }
  const mkRuntime = (model = {}) => ({ getModel: () => model })
  const tick = () => new Promise(r => setTimeout(r, 0))

  it('нет модели — unavailable', async () => {
    const seen = []
    createWordListener({ word: 'try', onChange: s => seen.push(s.status), runtime: mkRuntime(null) }).start()
    expect(seen).toEqual(['unavailable'])
  })

  it('два захода: слов набралось 1 + 2 → done, слоёв не больше трёх', async () => {
    const { listen, calls } = fakeListen([{ partials: ['try'], result: 'try' }, { partials: ['try', 'try try'], result: 'try try' }])
    const seen = []
    const l = createWordListener({ word: 'try', onChange: s => seen.push(s), runtime: mkRuntime(), listen, setTimer: fn => setTimeout(fn, 0) })
    l.start()
    for (let i = 0; i < 6; i++) await tick()
    expect(seen.at(-1)).toMatchObject({ status: 'done', hits: 3 })
    expect(Math.max(...seen.map(s => s.hits))).toBe(3)
    expect(calls).toHaveLength(2)
    expect(JSON.parse(calls[1].grammar)).toContain('try try') // второй заход ждёт только оставшиеся слова
    expect(JSON.parse(calls[1].grammar)).not.toContain('try try try')
    l.dispose()
  })

  it('счёт не откатывается, если поздний partial «передумал»', async () => {
    const { listen } = fakeListen([{ partials: ['try try', 'try'], result: 'try try try' }])
    const hits = []
    const l = createWordListener({ word: 'try', onChange: s => hits.push(s.hits), runtime: mkRuntime(), listen })
    l.start()
    for (let i = 0; i < 3; i++) await tick()
    expect(hits).toEqual([...hits].sort((a, b) => a - b))
    l.dispose()
  })
})

describe('вёрстка и подключения', () => {
  const css = read('../../../../styles/player/modules/word-lane.css')
  const micCss = read('../../../../styles/player/modules/word-lane-mic.css')

  it('длительности CSS совпадают с JS', () => {
    expect(FILL_MS).toBe(1000); expect(css).toContain('transition: transform 1s linear') // FILL_MS
    expect(DROP_MS).toBe(1000); expect(css).toContain('animation: wlDrop 1s')
    expect(LANES_MS).toBe(900)
    expect(TURN_MS).toBe(2200); expect(micCss).toContain('animation: wlTurn 2.2s')
  })

  it('модуль, стили и редактор подключены', () => {
    const index = read('../../../../index.css')
    expect(index).toContain("@import './styles/player/modules/word-lane.css'")
    expect(index).toContain("@import './styles/player/modules/word-lane-mic.css'")
    expect(index).not.toContain('speech-lane-overlay.css')
    expect(read('../index.js')).toContain('rotate_phone:    RotatePhoneModule')
    expect(read('../../../canvas/nodeTypes.js')).toContain("value: 'rotate_phone'")
    expect(read('../../../canvas/NodeContentEditor.jsx')).toContain("node.type === 'rotate_phone'")
  })

  it('микрофон просят заранее: на экране запуска урока', () => {
    expect(read('../../../lessons/LaunchPreloader.jsx')).toContain("n.type === 'rotate_phone') && <LaunchMicAsk />")
  })

  it('тап «Начать» будит звук и полный экран ДО любого await, микрофон проверяется до игры', () => {
    const mod = read('./RotatePhoneModule.jsx')
    const body = mod.slice(mod.indexOf('const start = useCallback'))
    expect(body.indexOf('unlockVoice()')).toBeLessThan(body.indexOf('await'))
    expect(body.indexOf('requestFullscreen')).toBeLessThan(body.indexOf('await'))
    expect(body.indexOf('ensureMicAccess()')).toBeLessThan(body.indexOf("setPhase('game')"))
  })

  it('слово ноды попадает в список озвучки, а урок греет Vosk', () => {
    expect(read('../../../../shared/lib/wordAudio/collectLessonWords.js')).toContain("case 'rotate_phone'")
    expect(read('../../useLessonWarmups.js')).toContain("n.type === 'rotate_phone'")
  })
})
