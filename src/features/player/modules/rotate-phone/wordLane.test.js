import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  PILLS, LANE_X, LANE_EDGES, FILL_AT, LISTEN_MS, LISTEN_ANCHORS, FILL_MS, DROP_MS, LANES_MS, TURN_MS, LINE_END_Y, LINE_START_Y, SLOT_COUNT,
  frontAtListen, pillProgress, stepSpeakFront, speakTarget, kickBack, buildAnchors,
} from './wordLaneTimeline.js'
import { analyzeHeard, wordGrammar } from './wordLaneMatch.js'
import { readWordLane, DEMO_WORD } from './wordLaneConfig.js'
import { createWordListener } from './wordLaneListen.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('раскладка: три дорожки, пилюли лесенкой', () => {
  it('пилюли в своих дорожках: первая внизу, вторая в центре экрана, третья наверху', () => {
    expect(PILLS.map(p => p.x)).toEqual(LANE_X)
    expect(PILLS[0].top).toBeGreaterThan(PILLS[1].bottom) // дальше по ходу линии (вверх) — следующая пилюля, друг на друга не налезают
    expect(PILLS[1].top).toBeGreaterThan(PILLS[2].bottom)
    expect((PILLS[1].top + PILLS[1].bottom) / 2).toBe(50) // вторая — ровно в центре
    expect(PILLS[0].bottom).toBeGreaterThanOrEqual(85)    // первая почти внизу
    expect(PILLS[2].top).toBeLessThanOrEqual(15)          // третья наверху
  })

  it('дорожки равные, разделители между ними', () => {
    expect(LANE_EDGES).toHaveLength(2)
    LANE_X.forEach((x, i) => expect(x).toBeCloseTo(i === 1 ? 50 : (i === 0 ? 100 / 6 : 500 / 6), 5))
    expect(LANE_X[1] - LANE_X[0]).toBeCloseTo(LANE_X[2] - LANE_X[1], 5)
  })

  it('линия идёт снизу вверх: вход в пилюлю = начало заливки, верх пилюли = конец слова', () => {
    const fillMs = FILL_AT.map(() => FILL_MS)
    FILL_AT.forEach((t, k) => {
      expect(frontAtListen(t)).toBeCloseTo(PILLS[k].bottom, 5)
      expect(frontAtListen(t + fillMs[k])).toBeCloseTo(PILLS[k].top, 5)
    })
    expect(frontAtListen(0)).toBe(LINE_START_Y)
    expect(frontAtListen(LISTEN_MS)).toBe(LINE_END_Y)
    expect(LINE_START_Y).toBeGreaterThan(100) // стартует из-за нижнего края
    expect(LINE_END_Y).toBeLessThan(0)        // уходит за верхний
  })

  it('заливка пилюли = то, что линия уже прошла (синхронно, без отдельных часов)', () => {
    expect(pillProgress(PILLS[0].bottom + 1, 0)).toBe(0)
    expect(pillProgress((PILLS[0].bottom + PILLS[0].top) / 2, 0)).toBeCloseTo(0.5, 5)
    expect(pillProgress(PILLS[0].top - 1, 0)).toBe(1)
    expect(pillProgress(LINE_START_Y, 2)).toBe(0)
    expect(pillProgress(LINE_END_Y, 2)).toBe(1)
  })

  it('скорость линии в пилюле = скорость речи: короткое слово — линия быстрее', () => {
    const slow = buildAnchors([1200, 3000, 5000], [1600, 1600, 1600])
    const quick = buildAnchors([1200, 3000, 5000], [500, 500, 500])
    const speed = (anchors, k) => { const [t0, y0] = anchors[1 + k * 2]; const [t1, y1] = anchors[2 + k * 2]; return (y0 - y1) / (t1 - t0) }
    expect(speed(quick, 0)).toBeGreaterThan(speed(slow, 0) * 2)
  })

  it('голова только поднимается', () => {
    let prev = Infinity
    for (let t = 0; t <= LISTEN_MS; t += 50) { const y = frontAtListen(t); expect(y).toBeLessThanOrEqual(prev); prev = y }
    expect(LISTEN_ANCHORS.at(-1)[1]).toBe(LINE_END_Y)
  })

  it('между заливками хватает времени на сами слова и паузу', () => {
    expect(FILL_AT[1] - FILL_AT[0]).toBeGreaterThan(FILL_MS)
    expect(FILL_AT[2] - FILL_AT[1]).toBeGreaterThan(FILL_MS)
  })
})

describe('линия ученика подстраивается под голос', () => {
  it('ждёт у нижнего края ближайшей пустой пилюли и не заходит в неё', () => {
    let f = LINE_START_Y
    for (let i = 0; i < 600; i++) f = stepSpeakFront({ front: f, dt: 0.05, hits: 0 })
    expect(f).toBeCloseTo(PILLS[0].bottom, 5)
    expect(pillProgress(f, 0)).toBe(0)
  })

  it('принятое слово — линия проходит пилюлю и ждёт у следующей; три слова — уходит за верх', () => {
    expect(speakTarget(1)).toBe(PILLS[1].bottom)
    expect(speakTarget(SLOT_COUNT)).toBe(LINE_END_Y)
    let f = PILLS[2].bottom
    for (let i = 0; i < 200; i++) f = stepSpeakFront({ front: f, dt: 0.05, hits: 3 })
    expect(f).toBe(LINE_END_Y)
  })

  it('после слова линия быстрее, чем в ожидании', () => {
    const slow = stepSpeakFront({ front: 80, dt: 0.1, hits: 1 })
    const fast = stepSpeakFront({ front: 80, dt: 0.1, hits: 1, caught: true })
    expect(fast).toBeLessThan(slow) // выше = меньше y
  })

  it('чужое слово отодвигает голову назад (вниз), но не глубже чем на шаг под край пилюли; цель ниже головы — идёт вниз', () => {
    expect(kickBack(70, 0)).toBeGreaterThan(70)
    expect(kickBack(PILLS[0].bottom, 0)).toBeLessThanOrEqual(PILLS[0].bottom + 4)
    expect(kickBack(LINE_START_Y, 0)).toBe(LINE_START_Y)
    expect(stepSpeakFront({ front: 60, dt: 0.1, hits: 0 })).toBeGreaterThan(60)
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
    expect(FILL_MS).toBe(1000)
    // Заливка пилюли = положение линии: CSS-перехода у неё нет (иначе отстанет), кроме фазы turn, где пилюли пустеют
    expect(css).toContain('transform: scaleY(var(--pv, 0))')
    expect(css).toContain(".wl[data-phase='turn'] .wlPillFill { transition: transform 0.6s ease; }")
    expect(css).not.toMatch(/^\.wlPillFill \{[^}]*transition/m)
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

  it('редактор ноды: ElevenLabs-озвучка → тайминги → клипы; таймлайн — на узлах таймлайна таблицы', () => {
    const picker = read('../../../canvas/NodeRotatePhonePicker.jsx')
    expect(picker).toContain("import NodeTableTts from './NodeTableTts.jsx'") // тот же генератор ElevenLabs, что у таблицы-диктора
    expect(picker).toContain('fillsFromTimings(patch.wordTimings, word, patch.duration)')
    expect(picker).toContain('<WordLaneEditorModal')
    const ed = read('../../../canvas/word-lane/WordLaneTimelineEditor.jsx')
    for (const part of ['useTimelineAudioSource', 'useTimelineStrip', 'TableTimelineRuler']) expect(ed).toContain(part)
    expect(read('../../../canvas/NodeContentEditor.jsx')).toContain('onRemoveFile={onRemoveLessonFile}')
    expect(read('../../../../index.css')).toContain("@import './styles/canvas/word-lane-editor.css'")
  })

  it('игра берёт озвучку ноды (file_id) и план по таймлайну', () => {
    expect(read('./RotatePhoneModule.jsx')).toContain('useAudioSource(node, file)')
    expect(read('./RotatePhoneModule.jsx')).toContain('audioSrc={cfg.hasAudio ? audioSrc : null}')
    expect(read('./useWordLaneFlow.js')).toContain('makeListenPlan(audioSrc ? fills : null)')
  })

  it('слово ноды попадает в список озвучки, а урок греет Vosk', () => {
    expect(read('../../../../shared/lib/wordAudio/collectLessonWords.js')).toContain("case 'rotate_phone'")
    expect(read('../../useLessonWarmups.js')).toContain("n.type === 'rotate_phone'")
  })
})
