import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { micRequestBegin, micRequestEnd, micRequestPending, micRequestStamp, resetMicRequest, MIC_GRACE_MS } from './gameMicRequest.js'
import { openGameMic, closeGameMic } from './gameMic.js'
import { installGameAudioLife, onGameAudioReturn, consumeRewake, lastAway } from './gameAudioLife.js'

// v3.3.147: «микрофон запрашивается» — от вызова getUserMedia до ответа и ещё MIC_GRACE_MS после: blur/focus от системного диалога доступа — не уход (журнал владельца: пауза посреди «Продолжить»)
const logs = vi.hoisted(() => [])
vi.mock('./debug.js', () => ({ pLog: m => logs.push(m) }))
beforeEach(() => { logs.length = 0; resetMicRequest() })
afterEach(() => { closeGameMic(); vi.unstubAllGlobals() })

describe('gameMicRequest', () => {
  it('запрос → pending; ответ → ещё MIC_GRACE_MS pending, потом нет; журнал запроса и ответа', () => {
    expect(micRequestPending(0)).toBe(false)
    micRequestBegin(100); expect(micRequestPending(5000)).toBe(true)
    micRequestEnd('granted', 900)
    expect(micRequestPending(900 + MIC_GRACE_MS - 1)).toBe(true); expect(micRequestPending(900 + MIC_GRACE_MS)).toBe(false)
    expect(micRequestStamp()).toEqual({ pending: 0, askedAt: 100, answeredAt: 900 })
    expect(logs[0]).toBe('[audio] микрофон: запрос getUserMedia (blur/focus за это время не пауза)')
    expect(logs[1]).toBe('[audio] микрофон: ответ granted через 800 мс (blur/focus ещё 1,5 с не пауза)')
  })
  it('openGameMic: пока getUserMedia ждёт ответа — pending; отказ тоже закрывает запрос', async () => {
    let answer
    const s = { getTracks: () => [{ readyState: 'live', muted: false, stop() {}, getSettings: () => ({}) }] }
    vi.stubGlobal('navigator', { userAgent: 'x', mediaDevices: { getUserMedia: vi.fn(() => new Promise(r => { answer = r })) } })
    const p = openGameMic()
    expect(micRequestStamp().pending).toBe(1); expect(micRequestPending()).toBe(true)
    answer(s); expect(await p).toBe('granted')
    expect(micRequestStamp().pending).toBe(0); expect(micRequestPending()).toBe(true) // окно после ответа
    closeGameMic(); resetMicRequest()
    vi.stubGlobal('navigator', { userAgent: 'x', mediaDevices: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error('no'), { name: 'NotAllowedError' })) } })
    expect(await openGameMic()).toBe('denied')
    expect(micRequestStamp().pending).toBe(0); expect(logs.some(l => l.includes('ответ NotAllowedError'))).toBe(true)
  })
})

describe('gameAudioLife: blur от диалога микрофона — не уход в фон; возврат сообщает, был ли hidden', () => {
  function env() {
    const docL = {}, winL = {}
    const add = o => (t, f) => { (o[t] ||= []).push(f) }
    const doc = { visibilityState: 'visible', addEventListener: add(docL), removeEventListener: () => {} }
    const win = { addEventListener: add(winL), removeEventListener: () => {} }
    return { doc, win, fire: (o, t) => (o === 'doc' ? docL : winL)[t]?.forEach(f => f({})) }
  }
  it('blur во время запроса: ни ухода, ни пометки, ни подписчиков возврата; blur без запроса → focus: подписчик получает { hidden: false }; hidden → visible — { hidden: true }', () => {
    let busy = true, t = 0
    const e = env()
    const off = installGameAudioLife({ doc: e.doc, win: e.win, nav: {}, now: () => t, ctxState: () => 'running', micBusy: () => busy })
    const got = []
    const offR = onGameAudioReturn((w, info) => got.push([w, info]))
    consumeRewake()
    e.fire('win', 'blur'); t = 700; e.fire('win', 'focus')
    expect(got).toEqual([]); expect(consumeRewake()).toBeNull(); expect(lastAway().hiddenAt).toBeNull()
    expect(logs.some(l => l.includes('blur во время запроса микрофона — не уход в фон'))).toBe(true)
    busy = false
    e.fire('win', 'blur'); t = 900; e.fire('win', 'focus')
    expect(got.at(-1)).toEqual(['focus', { hidden: false }])
    e.doc.visibilityState = 'hidden'; e.fire('doc', 'visibilitychange'); t = 5000; e.doc.visibilityState = 'visible'; e.fire('doc', 'visibilitychange')
    expect(got.at(-1)).toEqual(['visibility visible', { hidden: true }])
    offR(); off()
  })
})
