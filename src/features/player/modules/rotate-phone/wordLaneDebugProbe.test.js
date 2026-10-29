import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProbe, guessCaller, callerOf, shortSrc } from './wordLaneDebugProbe.js'
import { createWordLaneDebug } from './wordLaneDebug.js'

// «Скачать отладку», часть 3: пробник доступов и звука (getUserMedia, play(), speechSynthesis, AudioContext, окно) на поддельном окружении и отчёт scripts/dictor-debug-report.mjs.
function fakeEnv() {
  const listeners = {}
  const mkTarget = () => ({ addEventListener(t, fn) { (listeners[t] ??= []).push(fn) }, removeEventListener(t, fn) { listeners[t] = (listeners[t] ?? []).filter(f => f !== fn) } })
  const track = Object.assign(mkTarget(), { readyState: 'live', muted: false, label: 'mic', getSettings: () => ({ echoCancellation: false }) })
  const stream = { getAudioTracks: () => [track] }
  const md = { getUserMedia: vi.fn(async () => stream) }
  const el = Object.assign(mkTarget(), { tagName: 'AUDIO', src: 'https://x.test/a/word.mp3', readyState: 4, muted: false, volume: 1, paused: true, currentTime: 0 })
  const playImpl = vi.fn(function () { return Promise.resolve() })
  class HTMLMediaElement {}
  HTMLMediaElement.prototype.play = playImpl
  class FakeCtx extends (class {}) {
    constructor() { super(); Object.assign(this, mkTarget(), { state: 'suspended', sampleRate: 48000 }) }
  }
  const synth = { speak: vi.fn(), speaking: false, pending: false, paused: false, getVoices: () => [1, 2] }
  const doc = Object.assign(mkTarget(), { visibilityState: 'visible', fullscreenElement: null })
  const win = Object.assign(mkTarget(), { HTMLMediaElement, speechSynthesis: synth, AudioContext: FakeCtx })
  const perm = Object.assign(mkTarget(), { state: 'prompt' })
  const nav = { mediaDevices: md, userActivation: { isActive: true, hasBeenActive: true }, audioSession: { type: 'auto' }, permissions: { query: vi.fn(async () => perm) } }
  let t = 1000
  return { listeners, track, stream, md, el, playImpl, HTMLMediaElement, FakeCtx, synth, doc, win, nav, perm, now: () => (t += 10) }
}
const kinds = p => p.snapshot().map(e => e.kind)

describe('пробник: getUserMedia', () => {
  it('догадка о вызывающем и первые кадры стека', () => {
    expect(guessCaller({ audio: true })).toMatch(/ensureMicAccess/)
    expect(guessCaller({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } })).toMatch(/openGameMic/)
    expect(guessCaller({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } })).toMatch(/voskEngine/)
    expect(callerOf('Error\n    at wordLaneDebugProbe.js:1\n    at openGameMic (gameMic.js:40:5)\n    at start (RotatePhoneModule.jsx:50:3)')).toEqual(['openGameMic (gameMic.js:40:5)', 'start (RotatePhoneModule.jsx:50:3)'])
    expect(shortSrc('blob:https://a.b/1234-5678-abcd')).toBe('blob:…678-abcd')
    expect(shortSrc('data:audio/wav;base64,AAAA')).toMatch(/^data:/)
  })
  it('каждый вызов: запрос (constraints, живых потоков, окружение) и ответ (ok / имя ошибки, мс); результат вызова не меняется', async () => {
    const e = fakeEnv()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now, describeMic: () => ({ open: true }) })
    probe.install()
    const c = { audio: { echoCancellation: false, autoGainControl: true, channelCount: 1 } }
    expect(await e.md.getUserMedia(c)).toBe(e.stream)
    e.md.getUserMedia = Object.assign(vi.fn(async () => { throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }) }), {})
    const ev = probe.snapshot()
    const call = ev.find(x => x.kind === 'gum-call')
    expect(call).toMatchObject({ id: 1, guess: expect.stringMatching(/openGameMic/), constraints: c, live: 0, env: { vis: 'visible', fs: false, ua: { active: true, been: true }, as: 'auto' } })
    const res = ev.find(x => x.kind === 'gum-result')
    expect(res).toMatchObject({ ok: true, live: 1, tracks: [{ label: 'mic', readyState: 'live' }] })
    expect(res.ms).toBeGreaterThan(0)
    await new Promise(r => setTimeout(r, 0))
    expect(kinds(probe)).toContain('game-mic') // снимок describeGameMic после ответа
  })
  it('отказ пользователя попадает в журнал с именем ошибки; mute / ended дорожки — тоже', async () => {
    const e = fakeEnv()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    e.md.getUserMedia = vi.fn(async () => { throw Object.assign(new Error('nope'), { name: 'NotAllowedError' }) })
    probe.install()
    await expect(e.md.getUserMedia({ audio: true })).rejects.toThrow('nope')
    const r = probe.snapshot().find(x => x.kind === 'gum-result')
    expect(r).toMatchObject({ ok: false, error: 'NotAllowedError' })
    const ok = fakeEnv()
    const p2 = createProbe({ win: ok.win, doc: ok.doc, nav: ok.nav, now: ok.now })
    p2.install()
    await ok.md.getUserMedia({ audio: true })
    ok.track.muted = true; ok.listeners.mute.forEach(f => f()) // iOS заглушил дорожку: она live, но muted
    ok.track.readyState = 'ended'; ok.listeners.ended.forEach(f => f())
    expect(p2.snapshot().filter(x => x.kind === 'track').map(x => x.event)).toEqual(['mute', 'ended'])
  })
  it('установка один раз, uninstall возвращает прежние функции', () => {
    const e = fakeEnv()
    const origGum = e.md.getUserMedia
    const origPlay = e.HTMLMediaElement.prototype.play
    const origSpeak = e.synth.speak
    const origCtx = e.win.AudioContext
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install(); probe.install()
    expect(kinds(probe).filter(k => k === 'probe-install')).toHaveLength(1)
    expect(e.md.getUserMedia).not.toBe(origGum)
    expect(e.win.AudioContext).not.toBe(origCtx)
    probe.uninstall()
    expect(e.md.getUserMedia).toBe(origGum)
    expect(e.HTMLMediaElement.prototype.play).toBe(origPlay)
    expect(e.synth.speak).toBe(origSpeak)
    expect(e.win.AudioContext).toBe(origCtx)
    expect(probe.installed).toBe(false)
  })
})

describe('пробник: звук и окружение', () => {
  it('play(): вызов (src, readyState, muted, volume) и исход; отказ автозапуска NotAllowedError; первый зазвучавший звук по событию playing', async () => {
    const e = fakeEnv()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    const proto = e.HTMLMediaElement.prototype
    const p1 = proto.play.call(e.el)
    expect(p1).toBeInstanceOf(Promise)
    await p1
    e.playImpl.mockImplementationOnce(() => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })))
    await proto.play.call(e.el).catch(() => {})
    const ev = probe.snapshot()
    expect(ev.find(x => x.kind === 'play-call')).toMatchObject({ tag: 'AUDIO', src: 'https://x.test/a/word.mp3', rs: 4, muted: false, vol: 1 })
    expect(ev.filter(x => x.kind === 'play-result').map(x => x.ok ? 'ok' : x.error)).toEqual(['ok', 'NotAllowedError'])
  })
  it('playing → first-sound один раз', () => {
    const e = fakeEnv()
    const handlers = {}
    e.el.addEventListener = (t, fn) => { handlers[t] = fn }
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    e.HTMLMediaElement.prototype.play.call(e.el)
    handlers.playing(); handlers.playing()
    expect(kinds(probe).filter(k => k === 'first-sound')).toHaveLength(1)
    expect(kinds(probe).filter(k => k === 'playing')).toHaveLength(2)
    handlers.error()
    expect(kinds(probe)).toContain('media-error')
  })
  it('speechSynthesis.speak: текст, язык и события start / error', () => {
    const e = fakeEnv()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    const fns = {}
    const u = { text: 'trying', lang: 'en-US', volume: 1, rate: 1, addEventListener: (t, fn) => { fns[t] = fn } }
    e.win.speechSynthesis.speak(u)
    fns.start(); fns.error({ error: 'not-allowed' })
    const ev = probe.snapshot()
    expect(ev.find(x => x.kind === 'speech-speak')).toMatchObject({ text: 'trying', lang: 'en-US', voices: 2 })
    expect(ev.filter(x => x.kind === 'speech-event').map(x => x.event + (x.error ? ':' + x.error : ''))).toEqual(['start', 'error:not-allowed'])
  })
  it('AudioContext: создание и смены state; instanceof и статика работают', () => {
    const e = fakeEnv()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    const ctx = new e.win.AudioContext()
    expect(ctx).toBeInstanceOf(e.FakeCtx)
    ctx.state = 'running'
    e.listeners.statechange.forEach(f => f())
    const ev = probe.snapshot()
    expect(ev.find(x => x.kind === 'audiocontext')).toMatchObject({ state: 'suspended', rate: 48000 })
    expect(ev.find(x => x.kind === 'audiocontext-state')).toMatchObject({ state: 'running' })
  })
  it('окно: видимость, полный экран, pagehide, разрешение микрофона в начале / при смене / в конце', async () => {
    const e = fakeEnv()
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: e.now })
    probe.install()
    await Promise.resolve(); await Promise.resolve()
    e.doc.visibilityState = 'hidden'; e.listeners.visibilitychange.forEach(f => f())
    e.doc.fullscreenElement = {}; e.listeners.fullscreenchange.forEach(f => f())
    e.listeners.pagehide.forEach(f => f())
    e.perm.state = 'granted'; e.listeners.change.forEach(f => f())
    await probe.queryPermission('end')
    const ev = probe.snapshot()
    expect(ev.find(x => x.kind === 'visibility')).toMatchObject({ state: 'hidden' })
    expect(ev.find(x => x.kind === 'fullscreen')).toMatchObject({ on: true })
    expect(kinds(probe)).toContain('pagehide')
    expect(ev.filter(x => x.kind === 'permission').map(x => `${x.tag}:${x.state}`)).toEqual(['start:prompt', 'change:granted', 'end:granted'])
  })
  it('события пробника ложатся в журнал игры, в том числе до её старта (отрицательное время)', async () => {
    const e = fakeEnv()
    let now = 5000
    const probe = createProbe({ win: e.win, doc: e.doc, nav: e.nav, now: () => now })
    probe.install()
    await e.md.getUserMedia({ audio: true })
    now = 9000
    const log = createWordLaneDebug({ enabled: true, now: () => now })
    probe.snapshot().forEach(ev => { const { at, kind, ...d } = ev; log.ext(at, 'probe', kind, d) })
    const got = log.dump().events.filter(x => x.type === 'probe')
    expect(got.map(x => x.kind)).toContain('gum-call')
    expect(got.every(x => x.t <= 0)).toBe(true)
  })
})

describe('отчёт scripts/dictor-debug-report.mjs', () => {
  it('печатает разделы, хронологию, кривую уровня и сохраняет запись рядом', () => {
    const now = (() => { let t = 100000; const f = () => t; f.add = v => { t += v }; return f })()
    const log = createWordLaneDebug({ enabled: true, now, extras: () => ({ playerLog: ['[mic] игровой поток открыт'], gestureTrace: [] }) })
    log.meta({ phrase: 'i am | trying', chunks: ['i am', 'trying'], lang: 'en-US' })
    log.ext(98000, 'probe', 'gum-call', { id: 1, guess: 'openGameMic (игровой поток)', constraints: { audio: true }, caller: ['openGameMic (gameMic.js:40:5)'], live: 0 })
    log.ext(98300, 'probe', 'gum-result', { id: 1, ok: true, ms: 300, live: 1, tracks: [] })
    log.ext(98500, 'probe', 'play-call', { id: 2, tag: 'AUDIO', src: 'a.mp3', rs: 4, muted: false, vol: 1, paused: true })
    log.ext(98520, 'probe', 'play-result', { id: 2, ok: false, error: 'NotAllowedError', ms: 20, rs: 4 })
    log.stage('student', { idx: 3 })
    for (let i = 0; i < 40; i++) { log.level(i % 10 < 4 ? 0.3 : 0.01); now.add(50) }
    log.partial('i am', { seq: [], misses: 0, tail: { target: 0, tokens: 2 }, settled: true })
    log.pill('claim', { rep: 0, pill: 1, tk: 3 })
    log.note('note'); log.mute(900)
    const body = { ...log.dump(), userSaid: 'i am trying', audioParts: 1, audio: { mime: 'audio/webm;codecs=opus', base64: btoa('FAKEAUDIO'), startedAtMs: 99000 } }
    const dir = mkdtempSync(join(tmpdir(), 'dictor-'))
    const f = join(dir, 'dbg.json')
    writeFileSync(f, JSON.stringify(body))
    const out = execFileSync('node', [fileURLToPath(new URL('../../../../../scripts/dictor-debug-report.mjs', import.meta.url)), f], { encoding: 'utf8' })
    expect(out).toContain('Доступы и звук')
    expect(out).toMatch(/getUserMedia #1 запрос: openGameMic/)
    expect(out).toMatch(/play #2 ОТКАЗ NotAllowedError/)
    expect(out).toContain('первый зазвучавший звук: НЕ БЫЛО')
    expect(out).toContain('СТАДИЯ student')
    expect(out).toContain('partial «i am»')
    expect(out).toMatch(/пилюля claim/)
    expect(out).toContain('mute 900')
    expect(out).toContain('Уровень голоса по секундам')
    expect(out).toContain('█')
    expect(out).toContain('человек сказал: «i am trying»')
    expect(existsSync(`${f}.webm`)).toBe(true)
    expect(readFileSync(`${f}.webm`, 'utf8')).toBe('FAKEAUDIO')
  })
})
