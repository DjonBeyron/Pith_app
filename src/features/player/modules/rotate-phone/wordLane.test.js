import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  LANE_X, LANE_EDGES, PILL_H, ZONE_Y, ENTER_Y, EXIT_Y, WORD_AT, WORD_LEN, LISTEN_MS, DESCENT_MS, EXIT_MS, DROP_MS, LANES_MS, TURN_MS, SLOT_COUNT,
  pillY, pillFill, makeFillCurve, voiceFillStep, drainStep, VOICE_THRESHOLD, FILL_CAP, easeOutCubic,
} from './wordLaneTimeline.js'
import { analyzeHeard, wordGrammar } from './wordLaneMatch.js'
import { readWordLane, DEMO_WORD } from './wordLaneConfig.js'
import { createWordListener } from './wordLaneListen.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('раскладка: три дорожки, пилюли идут по очереди', () => {
  it('дорожки равные, разделители между ними', () => {
    expect(LANE_EDGES).toHaveLength(2)
    expect(LANE_X[1]).toBe(50)
    expect(LANE_X[1] - LANE_X[0]).toBeCloseTo(LANE_X[2] - LANE_X[1], 5)
  })

  it('зона голоса — примерно центр экрана; вход за верхним краем, выход за нижним', () => {
    expect(ZONE_Y).toBeGreaterThanOrEqual(45)
    expect(ZONE_Y).toBeLessThanOrEqual(55)
    expect(ENTER_Y + PILL_H / 2).toBeLessThan(0)   // пилюля целиком вне экрана сверху
    expect(EXIT_Y - PILL_H / 2).toBeGreaterThan(100) // и снизу
  })

  it('пилюля плавно опускается в зону к началу слова, стоит, пока звучит слово, и уходит вниз', () => {
    const at = 2000, ms = 1000
    expect(pillY(0, at, ms)).toBe(ENTER_Y)
    expect(pillY(at - DESCENT_MS, at, ms)).toBe(ENTER_Y)
    expect(pillY(at, at, ms)).toBeCloseTo(ZONE_Y, 5)
    const mid = pillY(at + ms / 2, at, ms)
    expect(mid).toBeGreaterThanOrEqual(ZONE_Y)
    expect(mid).toBeLessThan(ZONE_Y + 2)
    expect(pillY(at + ms + EXIT_MS, at, ms)).toBe(EXIT_Y)
    expect(pillY(at + ms + EXIT_MS * 5, at, ms)).toBe(EXIT_Y)
  })

  it('движение без рывков: на спуске пилюля только опускается, скорость к зоне падает (торможение), на уходе растёт', () => {
    const at = 2000, ms = 1000
    let prev = -Infinity, last = null
    for (let t = at - DESCENT_MS; t <= at + ms + EXIT_MS; t += 20) {
      const y = pillY(t, at, ms)
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9)
      prev = y; last = y
    }
    expect(last).toBe(EXIT_Y)
    const speed = (t0, t1) => (pillY(t1, at, ms) - pillY(t0, at, ms)) / (t1 - t0)
    expect(speed(at - 200, at)).toBeLessThan(speed(at - DESCENT_MS, at - DESCENT_MS + 200)) // у зоны медленнее, чем в начале
    expect(speed(at + ms + EXIT_MS - 200, at + ms + EXIT_MS)).toBeGreaterThan(speed(at + ms, at + ms + 200)) // уходит с ускорением
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('расписание по умолчанию: пилюли строго по очереди — следующая начинает спуск, пока предыдущая уходит, но слова не пересекаются', () => {
    expect(WORD_AT).toHaveLength(SLOT_COUNT)
    for (let k = 1; k < SLOT_COUNT; k++) {
      expect(WORD_AT[k]).toBeGreaterThan(WORD_AT[k - 1] + WORD_LEN[k - 1])
      expect(WORD_AT[k] - DESCENT_MS).toBeLessThan(WORD_AT[k - 1] + WORD_LEN[k - 1] + EXIT_MS) // перекрытие спуска и ухода
    }
    expect(WORD_AT[0]).toBeGreaterThanOrEqual(DESCENT_MS) // первой нужно время спуститься
    expect(LISTEN_MS).toBeGreaterThan(WORD_AT[2] + WORD_LEN[2] + EXIT_MS)
  })

  it('заливка пилюли идёт синхронно со словом: 0 до слова, 0…1 пока звучит, 1 после', () => {
    expect(pillFill(0, 2000, 1000)).toBe(0)
    expect(pillFill(2500, 2000, 1000)).toBeCloseTo(0.5, 5)
    expect(pillFill(3000, 2000, 1000)).toBe(1)
    expect(pillFill(9000, 2000, 1000)).toBe(1)
  })

  it('кривая заливки следует громкости: пока диктор говорит громко — бежит, в паузе внутри слова — почти стоит', () => {
    // слово 0…2 с: громко в первую секунду, тихо во вторую
    const wave = [...Array(30).fill(200), ...Array(30).fill(4)]
    const curve = makeFillCurve(wave, 2, 0, 2)
    expect(curve(0)).toBeCloseTo(0, 5)
    expect(curve(1)).toBeCloseTo(1, 5)
    expect(curve(0.5)).toBeGreaterThan(0.45)  // за первую половину слова (громкую) залито почти всё
    expect(curve(0.5) - curve(0.25)).toBeGreaterThan(curve(1) - curve(0.75) + 0.1) // на громком кусе быстрее, чем на тихом
    let prev = -1
    for (let u = 0; u <= 1; u += 0.05) { const v = curve(u); expect(v).toBeGreaterThanOrEqual(prev); prev = v }
    expect(makeFillCurve(null, 2, 0, 1)).toBeNull()
    expect(makeFillCurve(wave, 2, 1, 1)).toBeNull()
    expect(pillFill(2500, 2000, 1000, curve)).toBeGreaterThan(0.85) // середина слова, но громкая часть уже прошла
  })
})

describe('заливка пилюли голосом ученика', () => {
  it('тишина не двигает и не сливает; голос наливает быстрее при большей громкости; выше FILL_CAP голос не заливает', () => {
    expect(voiceFillStep(0.3, 0.1, 0)).toBe(0.3)
    expect(voiceFillStep(0.3, 0.1, VOICE_THRESHOLD)).toBe(0.3)
    const quiet = voiceFillStep(0, 0.1, 0.2)
    const loud = voiceFillStep(0, 0.1, 0.6)
    expect(loud).toBeGreaterThan(quiet)
    expect(quiet).toBeGreaterThan(0)
    let p = 0
    for (let i = 0; i < 200; i++) p = voiceFillStep(p, 0.05, 1)
    expect(p).toBe(FILL_CAP)
  })

  it('чужое слово сливает заливку, не уходя ниже нуля', () => {
    expect(drainStep(0.5, 0.1)).toBeLessThan(0.5)
    expect(drainStep(0.05, 1)).toBe(0)
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
    // Заливка пилюли = положение линии: CSS-перехода у неё нет (иначе отстанет), кроме фазы turn, где пилюли пустеют
    expect(css).toContain('transform: scaleY(var(--pv, 0))')
    expect(css).toContain('translate(-50%, calc(var(--y) * 1dvh - 50%))') // положение — GPU-трансформация из --y
    expect(css).not.toMatch(/^\.wlPill(Fill)? \{[^}]*transition/m) // движок сам пишет каждый кадр: переходы отставили бы пилюлю от речи
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
    expect(read('./useWordLaneFlow.js')).toContain('makeListenPlan(audioSrc ? fills : null, audio)')
  })

  it('слово ноды попадает в список озвучки, а урок греет Vosk', () => {
    expect(read('../../../../shared/lib/wordAudio/collectLessonWords.js')).toContain("case 'rotate_phone'")
    expect(read('../../useLessonWarmups.js')).toContain("n.type === 'rotate_phone'")
  })
})
