import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../../../shared/lib/deviceTier.js', () => ({ isWeakDevice: () => false }))
vi.mock('../../../scene/v2/sceneAudioUnlock.js', () => ({ getSceneAudioElement: () => null, peekSceneSpareElement: () => null, unlockSceneAudio: () => {} }))

const { attachSceneSolo, sceneSoloSeq, sceneSoloBusy, sceneSoloListeners, noteSceneGesture, sceneGestureSeq } = await import('./useSceneSolo.js')
const { expandStatusOf, expandAction } = await import('./sceneFullscreenModel.js')
const { autoStartYields } = await import('./sceneStartPlan.js')
const { speakFallback } = await import('../../../scene/v2/linePlayback.js')

const doc = () => ({ addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] })

// Модель прерываний: кружок B (автозапуск) и сцена A из истории на общей шине «звучит одна сцена»
describe('прерывание кружка сценой из истории (useSceneSolo)', () => {
  it('автозапуск, дождавшийся своего часа, не перебивает сцену, запущенную пользователем за время ожидания', () => {
    const armedSeq = sceneSoloSeq()
    expect(autoStartYields({ armedSeq, seq: sceneSoloSeq(), busy: sceneSoloBusy() })).toBe(false) // никто не играл — стартуем
    const offA = attachSceneSolo({ rootEl: null, pause: () => {}, doc: doc(), own: null }) // пользователь запустил A
    expect(autoStartYields({ armedSeq, seq: sceneSoloSeq(), busy: sceneSoloBusy() })).toBe(true)
    offA() // A доиграла/встала на паузу — старт больше ничему не мешает
    expect(autoStartYields({ armedSeq, seq: sceneSoloSeq(), busy: sceneSoloBusy() })).toBe(false)
  })

  it('жест по другой сцене уже сказал «я запускаюсь», хотя на шину она ещё не попала (запуск в пути ~0,5 с на слабом телефоне)', () => {
    const armed = { armedSeq: sceneSoloSeq(), armedGesture: sceneGestureSeq() }
    noteSceneGesture() // тап по A: полный экран/раскрытие ещё монтируются, attachSceneSolo A не вызван
    expect(autoStartYields({ ...armed, seq: sceneSoloSeq(), busy: sceneSoloBusy(), gesture: sceneGestureSeq() })).toBe(true)
    // жест, бывший ДО постановки в очередь, не мешает
    const rearmed = { armedSeq: sceneSoloSeq(), armedGesture: sceneGestureSeq() }
    expect(autoStartYields({ ...rearmed, seq: sceneSoloSeq(), busy: sceneSoloBusy(), gesture: sceneGestureSeq() })).toBe(false)
  })

  it('сцена, игравшая ДО постановки автозапуска в очередь, его не блокирует (зомби-подписка не залипает)', () => {
    const off = attachSceneSolo({ rootEl: null, pause: () => {}, doc: doc(), own: null })
    const armedSeq = sceneSoloSeq()
    expect(autoStartYields({ armedSeq, seq: sceneSoloSeq(), busy: sceneSoloBusy() })).toBe(false)
    off()
  })

  it('50 циклов «B играет → A перебила → A встала» — подписок не остаётся, B каждый раз получает паузу', () => {
    for (let i = 0; i < 50; i++) {
      const pauseB = vi.fn()
      const offB = attachSceneSolo({ rootEl: null, pause: pauseB, doc: doc(), own: null })
      const offA = attachSceneSolo({ rootEl: null, pause: () => {}, doc: doc(), own: null })
      expect(pauseB).toHaveBeenCalledTimes(1)
      offB(); offA()
    }
    expect(sceneSoloListeners()).toBe(0)
  })
})

describe('раскрытие кружка доигравшей сцены (expandStatusOf)', () => {
  it('свёрнутая доигравшая сцена — всегда «ended» → запуск с начала, даже если в состоянии осталось playing/paused', () => {
    for (const stale of ['playing', 'paused', 'idle', 'ended']) {
      expect(expandAction(expandStatusOf(stale, true))).toBe('restart')
    }
  })
  it('недоигравшая — статус как есть (идёт: не трогаем; пауза/idle: play)', () => {
    expect(expandAction(expandStatusOf('playing', false))).toBe(null)
    expect(expandAction(expandStatusOf('paused', false))).toBe('play')
    expect(expandAction(expandStatusOf('idle', false))).toBe('play')
  })
})

describe('озвучка синтезом: cancel() гасит только свою реплику (speakFallback)', () => {
  let synth
  beforeEach(() => {
    synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [{ lang: 'en-US', name: 'Samantha', localService: true, voiceURI: 'x' }] }
    globalThis.window = { speechSynthesis: synth, SpeechSynthesisUtterance: function (t) { this.text = t } }
  })
  afterEach(() => { delete globalThis.window })

  it('прерванная сцена, ставшаяся на паузу ПОСЛЕ старта другой, не глушит чужой голос', () => {
    const endB = vi.fn(); const endA = vi.fn()
    const cancelB = speakFallback('Hello from B', {}, { synth: true, onEnd: endB })
    const cancelA = speakFallback('Hello from A', {}, { synth: true, onEnd: endA })
    const callsAfterStarts = synth.cancel.mock.calls.length
    cancelB() // B ставят на паузу, A уже говорит
    expect(synth.cancel.mock.calls.length).toBe(callsAfterStarts)
    cancelA() // а свой голос гасится как раньше
    expect(synth.cancel.mock.calls.length).toBe(callsAfterStarts + 1)
  })

  it('вытесненная чужим speak() реплика не считается законченной (иначе её сцена пропустила бы реплику)', () => {
    const endB = vi.fn()
    speakFallback('Hello from B', {}, { synth: true, onEnd: endB })
    const uB = synth.speak.mock.calls[0][0]
    speakFallback('Hello from A', {}, { synth: true })
    uB.onerror({ error: 'canceled' })
    expect(endB).not.toHaveBeenCalled()
  })

  it('обычный конец и ошибка своей реплики — onEnd как раньше', () => {
    const end = vi.fn()
    speakFallback('Hi', {}, { synth: true, onEnd: end })
    synth.speak.mock.calls[0][0].onend()
    expect(end).toHaveBeenCalledTimes(1)
    const end2 = vi.fn()
    speakFallback('Hi again', {}, { synth: true, onEnd: end2 })
    synth.speak.mock.calls[1][0].onerror({ error: 'synthesis-failed' })
    expect(end2).toHaveBeenCalledTimes(1)
  })
})
