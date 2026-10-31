import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { MIC_GAIN_KEY, MIC_GAIN_LEVELS, DEFAULT_MIC_GAIN, readMicGainId, writeMicGainId, readMicGain, micGainLogLine } from './gameMicGain.js'
import { wireInput, LIMITER } from './vosk/voskGain.js'
import { closeGameMic, GAME_MIC_CONSTRAINTS } from './gameMic.js'

const memStore = (init = {}) => { const m = { ...init }; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v) }, removeItem: k => { delete m[k] }, m } }
const broken = { getItem() { throw new Error('private') }, setItem() { throw new Error('private') }, removeItem() { throw new Error('private') } }
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8')

afterEach(() => { closeGameMic(); vi.unstubAllGlobals() })

// «Чувствительность микрофона» (v3.3.84): тихо сказанное слово слышно — программное усиление перед Vosk, обработка системой остаётся выключенной
describe('настройка pithy_game_mic_gain_v1', () => {
  it('три уровня: обычная ×1, высокая ×2 (по умолчанию), очень высокая ×4', () => {
    expect(MIC_GAIN_LEVELS.map(l => [l.id, l.gain])).toEqual([['normal', 1], ['high', 2], ['max', 4]]); expect(DEFAULT_MIC_GAIN).toBe('high')
    expect(readMicGainId(memStore())).toBe('high'); expect(readMicGain(memStore())).toBe(2)
  })
  it('запись и чтение; по умолчанию ключ снимается; мусор и битое хранилище — по умолчанию', () => {
    const s = memStore()
    writeMicGainId('max', s); expect(s.m).toEqual({ [MIC_GAIN_KEY]: 'max' }); expect(readMicGain(s)).toBe(4)
    writeMicGainId('normal', s); expect(readMicGain(s)).toBe(1)
    writeMicGainId('high', s); expect(s.m).toEqual({}); writeMicGainId('громко', s); expect(s.m).toEqual({})
    expect(readMicGainId(memStore({ [MIC_GAIN_KEY]: 'x4' }))).toBe('high'); expect(readMicGain(broken)).toBe(2); expect(() => writeMicGainId('max', broken)).not.toThrow()
  })
  it('строка журнала: «[mic] усиление ×N»', () => {
    expect(micGainLogLine(memStore())).toMatch(/^\[mic\] усиление ×2 \(высокая ×2; перед Vosk: GainNode \+ мягкий ограничитель\)$/)
    expect(micGainLogLine(memStore({ [MIC_GAIN_KEY]: 'max' }))).toContain('усиление ×4'); expect(micGainLogLine(memStore({ [MIC_GAIN_KEY]: 'normal' }))).toContain('усиление ×1 (обычная; цепочки нет)')
  })
})

// Цепочка перед распознавателем
function fakeCtx({ compressor = true } = {}) {
  const mk = name => { const n = { name, to: [], connect(x) { n.to.push(x); return x } }; return n }
  const ctx = { createGain: () => { const g = mk('gain'); g.gain = { value: 1 }; return g } }
  if (compressor) ctx.createDynamicsCompressor = () => { const c = mk('comp'); for (const k of Object.keys(LIMITER)) c[k] = { value: 0 }; return c }
  return ctx
}
describe('цепочка усиления перед Vosk (voskGain.wireInput)', () => {
  it('×1: цепочки нет, источник подключён к узлу напрямую (как раньше)', () => {
    const src = { to: [], connect(x) { this.to.push(x) } }, node = {}
    expect(wireInput(fakeCtx(), src, node, 1)).toEqual([]); expect(src.to).toEqual([node]); expect(wireInput(fakeCtx(), src, node, undefined)).toEqual([])
  })
  it('×2 / ×4: источник → GainNode (нужное усиление) → мягкий ограничитель → узел распознавателя; узлы возвращаются для отключения', () => {
    for (const gain of [2, 4]) {
      const src = { to: [], connect(x) { this.to.push(x); return x } }, node = { name: 'node' }
      const nodes = wireInput(fakeCtx(), src, node, gain)
      const [g, c] = nodes
      expect(nodes.map(n => n.name)).toEqual(['gain', 'comp']); expect(g.gain.value).toBe(gain)
      expect(src.to).toEqual([g]); expect(g.to).toEqual([c]); expect(c.to).toEqual([node])
      for (const [k, v] of Object.entries(LIMITER)) expect(c[k].value).toBe(v)
    }
    expect(LIMITER.threshold).toBeLessThan(0); expect(LIMITER.ratio).toBeGreaterThanOrEqual(12)
  })
  it('нет компрессора в браузере — хотя бы усиление, звук не пропадает; нет GainNode — напрямую', () => {
    const src = { to: [], connect(x) { this.to.push(x); return x } }, node = {}
    const nodes = wireInput(fakeCtx({ compressor: false }), src, node, 2)
    expect(nodes).toHaveLength(1); expect(nodes[0].to).toEqual([node])
    const direct = { to: [], connect(x) { this.to.push(x) } }
    expect(wireInput({}, direct, node, 2)).toEqual([]); expect(direct.to).toEqual([node])
  })
})

describe('подключение: движок, слушатель, микрофон игры', () => {
  it('движок Vosk строит цепочку по opts.gain и отключает её узлы вместе с остальными; запись голоса и «Сказать фразу» без gain идут напрямую', () => {
    const e = read('./vosk/voskEngine.js')
    expect(e).toContain('chain = wireInput(ctx, src, node, opts.gain)'); expect(e).toContain('nodes: [node, src, ...chain]')
    expect(e.split('\n').length).toBeLessThanOrEqual(250)
  })
  it('слушатель игры отдаёт движку gain из настройки (уровень для колец микрофона считается по усиленному звуку — в движке он берётся из inputBuffer после цепочки)', () => {
    expect(read('../../features/player/modules/rotate-phone/wordLaneListen.js')).toContain('gain: micGain()')
    expect(read('./vosk/voskEngine.js')).toContain('const rms = bufferRms(ev.inputBuffer)') // inputBuffer ScriptProcessor — после GainNode и ограничителя
  })
  it('обработка системой остаётся выключенной: усиление программное, ограничения getUserMedia не менялись', () => {
    expect(GAME_MIC_CONSTRAINTS).toMatchObject({ echoCancellation: false, noiseSuppression: false })
    expect(read('./gameMic.js')).not.toMatch(/echoCancellation: true, noiseSuppression: true, autoGainControl: false/)
  })
  it('при открытии микрофона в журнал уходят «[mic] усиление ×N» и то, что реально применила дорожка (автоусиление iOS)', async () => {
    const lines = []
    vi.resetModules()
    vi.doMock('./debug.js', () => ({ pLog: t => lines.push(String(t)), dbg() {} }))
    const gm = await import('./gameMic.js')
    const t = { readyState: 'live', enabled: true, muted: false, stop() {}, getSettings: () => ({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }) }
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [t] }) }, userAgent: 'x' })
    expect(await gm.openGameMic()).toBe('granted')
    expect(lines.some(l => l.startsWith('[mic] усиление ×'))).toBe(true)
    expect(lines).toContain('[mic] дорожка применила: эхо false, шумодав false, автоусиление false')
    expect(gm.describeGameMic().gain).toBe(2)
    gm.closeGameMic(); vi.doUnmock('./debug.js'); vi.resetModules()
  })
})
