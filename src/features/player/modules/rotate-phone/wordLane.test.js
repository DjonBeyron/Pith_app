import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DROP_MS, LANES_MS, breathStep, drainStep, VOICE_THRESHOLD, FILL_CAP } from './wordLaneTimeline.js'
import { analyzeHeard, wordGrammar } from './wordLaneMatch.js'
import { readWordLane, DEMO_WORD } from './wordLaneConfig.js'
import { createWordListener } from './wordLaneListen.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const readLane = () => read('../../../../styles/player/modules/word-lane.css') + read('../../../../styles/player/modules/word-lane-pill.css') // раскладка и пилюли: одна вёрстка игры в двух файлах

describe('заливка пилюли голосом ученика', () => {
  it('тишина не наливает (заливка спадает мягко, а не рывком); голос наливает быстрее при большей громкости; выше FILL_CAP голос не заливает', () => {
    expect(breathStep(0.3, 0.016, 0)).toBeLessThan(0.3)
    expect(breathStep(0.3, 0.016, 0)).toBeGreaterThan(0.25)
    expect(breathStep(0.3, 0.016, VOICE_THRESHOLD)).toBeLessThan(0.3)
    expect(breathStep(0, 0.1, 0)).toBe(0)
    const quiet = breathStep(0, 0.1, 0.1)
    const loud = breathStep(0, 0.1, 0.6)
    expect(loud).toBeGreaterThan(quiet)
    expect(quiet).toBeGreaterThan(0)
    let p = 0
    for (let i = 0; i < 200; i++) p = breathStep(p, 0.05, 1)
    expect(p).toBeLessThanOrEqual(FILL_CAP)
    expect(p).toBeGreaterThan(FILL_CAP - 0.001)
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
  it('пустая нода играет встроенным словом, заполненная — своим; фраза режется по «|» (до трёх кусков)', () => {
    expect(readWordLane({})).toMatchObject({ chunks: [DEMO_WORD.word], translation: DEMO_WORD.translation, isDemo: true })
    expect(readWordLane({ word: ' cat ', translation: 'кот', content: 'Привет' })).toMatchObject({ chunks: ['cat'], word: 'cat', translation: 'кот', title: 'Привет', isDemo: false })
    expect(readWordLane({ word: 'cat' }).translation).toBe('') // чужой перевод демо-слова к своему слову не липнет
    expect(readWordLane({ phrase: "I'm | trying | to learn", word: 'x' }).chunks).toEqual(["I'm", 'trying', 'to learn'])
    expect(readWordLane({ phrase: "I'm | trying | to learn" }).word).toBe("I'm trying to learn")
  })
  it('клипы озвучки: без файла нет; одно слово — из таймлайна fills; фраза — из таймингов слов по порядку высказываний', () => {
    expect(readWordLane({ phrase: 'a | b' }).clips).toBeNull()
    const fills = [{ start: 0.3, end: 0.8 }, { start: 1.6, end: 2.1 }, { start: 3.1, end: 3.6 }]
    expect(readWordLane({ word: 'try', file_id: 'f', fills, duration: 4 }).clips).toHaveLength(3)
    const words = ['a', 'b', 'a', 'b'].map((w, i) => ({ w, t: i * 0.5, e: i * 0.5 + 0.4 }))      // высказывания: a, b, a+b
    expect(readWordLane({ phrase: 'a | b', file_id: 'f', wordTimings: words, duration: 3 }).clips).toHaveLength(3)
  })
})

describe('слушатель: счёт копится по заходам', () => {
  function fakeListen(script) {
    const calls = []
    const listen = async (model, grammar, cb, opts) => {
      calls.push({ grammar, opts })
      const step = script.shift() ?? { hang: true } // сценарий кончился — слушатель просто ждёт, как живой микрофон в тишине
      queueMicrotask(() => { cb.onReady?.(); if (step.hang) return; step.partials?.forEach(p => cb.onPartial(p)); cb.onResult(step.result, { words: step.words ?? [] }) })
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

  it('два захода: слов набралось 1 + 2 → счёт копится без потолка, сами заходы не заканчивают игру (это решает конвейер)', async () => {
    const { listen, calls } = fakeListen([{ partials: ['try'], result: 'try' }, { partials: ['try', 'try try'], result: 'try try' }, { partials: [], result: '' }])
    const seen = []
    const l = createWordListener({ word: 'try', onChange: s => seen.push(s), runtime: mkRuntime(), listen, setTimer: fn => setTimeout(fn, 0) })
    l.start()
    for (let i = 0; i < 8; i++) await tick()
    expect(Math.max(...seen.map(s => s.hits))).toBe(3)
    expect(seen.some(s => s.status === 'done')).toBe(false)   // «done» по числу слов убран: слушатель живёт, пока игра не закроет его сама
    expect(calls.length).toBeGreaterThanOrEqual(3)            // после «трёх слов» слушает дальше — вдруг пилюлю ещё придётся выкатить заново
    expect(JSON.parse(calls[1].grammar)).toContain('try try try') // в каждом заходе словарь на SLOT_COUNT слов
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
  const css = readLane()
  const plateCss = read('../../../../styles/player/modules/word-lane-plate.css')

  it('длительности CSS совпадают с JS', () => {
    // Заливка пилюли = положение линии: CSS-перехода у неё нет (иначе отстанет), кроме фазы turn, где пилюли пустеют
    expect(css).toMatch(/\.wlPillFill \{[^}]*transform: translateY\(100%\)/)                    // заливку пишет движок прямо в style.transform fill-слоя: translateY((1 − p)·100 %), край едет, не растягиваясь
    expect(css).toContain('translate: -50% calc(var(--y) * 1dvh - 50%)') // стартовое положение — свойство translate (сам ход — WAAPI)
    expect(css).not.toMatch(/^\.wlPill(Fill)? \{[^}]*transition/m) // движок сам пишет каждый кадр: переходы отставили бы пилюлю от речи
    expect(DROP_MS).toBe(1000); expect(css).toContain('animation: wlDrop 1s')
    expect(LANES_MS).toBe(900)
    expect(plateCss).toContain('wlTurnIn 0.3s')                                             // появление плашки; уход — WAAPI по кривой взлёта пилюли (wordLanePlateExit.js), не CSS
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

  it('тап «Начать»: полный экран и startGameAudio (тип сессии → микрофон) вызываются ДО любого await, игра открывается после', () => {
    const mod = read('./RotatePhoneModule.jsx')
    const body = mod.slice(mod.indexOf('const start = useCallback'), mod.indexOf('const restart = useCallback'))
    const call = body.indexOf('await startGameAudio({')
    expect(call).toBeGreaterThan(0)
    expect(body.slice(0, call)).not.toMatch(/await/) // всё до вызова — в жесте (сам вызов синхронно открывает сессию и микрофон)
    expect(body.indexOf('requestFullscreen')).toBeLessThan(call)
    expect(call).toBeLessThan(body.indexOf("setPhase('game')"))
    expect(body).not.toContain('unlockVoice()') // звук диктора будится не здесь, а после открытия микрофона (wordLaneStart.js)
    expect(mod).toContain("if (mic !== 'granted') { abortGame()") // микрофон не дали — игра не открывается
    expect(mod.slice(mod.indexOf('const restart = useCallback'))).toContain('startGameAudio({ cfg, audioSrc, lines })') // «Игра заново» — тот же порядок
  })

  it('wordLaneStart: синхронный префикс — тип сессии и микрофон; звук будится после ожидания (settle), а не до микрофона', () => {
    const start = read('./wordLaneStart.js')
    const body = start.slice(start.indexOf('export function startGameAudio'))
    const order = ['session.begin()', 'openMic()', 'await micPromise', 'warm.settle()', 'wake({ cfg'].map(t => body.indexOf(t))
    expect(order.every(i => i > 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(body.indexOf('await')).toBeGreaterThan(body.indexOf('openMic()')) // до первого await — только begin, session, openMic
  })

  it('редактор ноды: ElevenLabs-озвучка → тайминги → клипы; таймлайн — на узлах таймлайна таблицы', () => {
    const picker = read('../../../canvas/NodeRotatePhonePicker.jsx')
    expect(picker).toContain("import NodeTableTts from './NodeTableTts.jsx'") // тот же генератор ElevenLabs, что у таблицы-диктора
    expect(picker).toContain('fillsFromTimings(patch.wordTimings, chunks[0]')      // у одного слова таймлайн расставляется сразу
    expect(picker).toContain('clipsFromTimings(tData.wordTimings, chunks, tData.duration)') // у фразы клипы кусков — из таймингов слов
    expect(picker).toContain('<WordLaneEditorModal')
    const ed = read('../../../canvas/word-lane/WordLaneTimelineEditor.jsx')
    for (const part of ['useTimelineAudioSource', 'useTimelineStrip', 'TableTimelineRuler']) expect(ed).toContain(part)
    expect(read('../../../canvas/NodeContentEditor.jsx')).toContain('onRemoveFile={onRemoveLessonFile}')
    expect(read('../../../../index.css')).toContain("@import './styles/canvas/word-lane-editor.css'")
  })

  it('игра берёт озвучку ноды (file_id) и план по таймлайну', () => {
    expect(read('./RotatePhoneModule.jsx')).toContain('useAudioSource(node, file)')
    expect(read('./RotatePhoneModule.jsx')).toContain('audioSrc={cfg.hasAudio ? audioSrc : null}')
    expect(read('./useWordLaneFlow.js')).toContain('buildStages({ chunks, clips, audio, rate, lib, confusers, plan })')
    expect(read('./WordLaneGame.jsx')).toContain('clips: cfg.clips')
  })

  it('слово ноды попадает в список озвучки, а урок греет Vosk', () => {
    expect(read('../../../../shared/lib/wordAudio/collectLessonWords.js')).toContain("case 'rotate_phone'")
    expect(read('../../useLessonWarmups.js')).toContain("n.type === 'rotate_phone'")
  })
})
