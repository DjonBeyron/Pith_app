import { describe, it, expect, beforeEach } from 'vitest'

// Подставные <audio>, AudioContext и document: считаем запуски. Проверяем, что при удержании тишины / окна записи
// playSound, warmSound, unlockAudio, primeAudio молчат и ничего не «разблокируют», а в журнал звуков (soundLog) пишется только реально сыгранное.
const plays = []
const created = []
class FakeAudio {
  constructor(src) { this.src = src; this.currentTime = 0; this.paused = true; this.attrs = {}; created.push(src) }
  play() { plays.push(this.src ?? 'primed'); this.paused = false; return Promise.resolve() }
  pause() { this.paused = true }
  load() {}
  setAttribute(k, v) { this.attrs[k] = v }
  getAttribute(k) { return this.attrs[k] ?? null }
  removeAttribute() {}
  remove() {}
  addEventListener() {}
  removeEventListener() {}
  style = {}
}
let resumes = 0
class FakeCtx {
  constructor() { this.state = 'suspended' }
  resume() { resumes += 1; this.state = 'running'; return Promise.resolve() }
  suspend() { return Promise.resolve() }
}
const listeners = {}
globalThis.Audio = FakeAudio
globalThis.window = { AudioContext: FakeCtx }
globalThis.document = {
  createElement: () => new FakeAudio(undefined),
  body: { appendChild() {} },
  addEventListener: (ev, fn) => { (listeners[ev] ??= new Set()).add(fn) },
  removeEventListener: (ev, fn) => { listeners[ev]?.delete(fn) },
}
const fire = (ev, target = { closest: () => null }) => [...(listeners[ev] ?? [])].forEach(fn => fn({ target }))

const sounds = await import('./sounds.js')
const primed = await import('./primedAudio.js')
const quiet = await import('./soundQuiet.js')
const log = await import('./soundLog.js')
const { playSound, preloadSounds, unlockAudio, warmSound, setSoundsMuted } = sounds

const kinds = () => log.soundEvents().map(e => e.kind)
beforeEach(() => { plays.length = 0; created.length = 0; resumes = 0; quiet._resetSoundQuiet(); log._resetSoundLog(); setSoundsMuted(false) })

describe('playSound и логирование', () => {
  it('обычный звук играет и пишется в журнал как audio-play', () => {
    playSound('message-in')
    expect(plays).toHaveLength(1)
    expect(log.soundEvents()).toMatchObject([{ kind: 'audio-play', src: 'message-in' }])
  })

  it('holdSilence (вкладка «Голос»): playSound молчит полностью — ни звука, ни события в журнале, ни отложенного повтора после снятия', () => {
    const release = quiet.holdSilence('admin-voice')
    playSound('message-in')
    playSound('xp-gain')
    playSound('answer-correct')
    expect(plays).toHaveLength(0)
    expect(log.soundEvents()).toHaveLength(0)
    release()
    expect(plays).toHaveLength(0)
    playSound('message-in')
    expect(plays).toHaveLength(1)
  })

  it('окно записи модуля (holdSoundQuiet): message-in откладывается и играет один раз после закрытия', () => {
    const release = quiet.holdSoundQuiet()
    playSound('message-in')
    playSound('message-in')
    expect(plays).toHaveLength(0)
    release()
    expect(plays).toHaveLength(1)
  })
})

describe('разблокировка звука молчит, пока идёт запись / открыта вкладка «Голос»', () => {
  it('unlockAudio: ctx.resume() не зовётся при удержании, после снятия — зовётся; resume пишется в журнал как audiocontext', () => {
    preloadSounds()
    expect(kinds()).toContain('audiocontext') // создание контекста
    log._resetSoundLog()
    const release = quiet.holdSilence('admin-voice')
    unlockAudio()
    expect(resumes).toBe(0)
    release()
    unlockAudio()
    expect(resumes).toBe(1)
    expect(log.soundEvents()).toMatchObject([{ kind: 'audiocontext', src: 'resume' }])
  })

  it('warmSound (беззвучный прогрев элемента) при удержании не играет', () => {
    preloadSounds()
    plays.length = 0
    const release = quiet.holdSoundQuiet()
    warmSound('xp-gain')
    expect(plays).toHaveLength(0)
    release()
  })

  it('primeAudio (беззвучный wav) при удержании не играет и ставит слушатель на ближайшее свободное касание; тап в удержании — тоже тишина', async () => {
    const release = quiet.holdSilence('admin-voice')
    primed.primeAudio()
    expect(plays).toHaveLength(0)
    expect(log.soundEvents()).toHaveLength(0)
    fire('pointerdown') // касание на вкладке «Голос»: слушатель остаётся, wav не играет
    expect(plays).toHaveLength(0)
    expect(listeners.pointerdown?.size).toBe(1)
    release()
    fire('pointerdown', { closest: sel => (sel === '[data-no-unlock]' ? {} : null) }) // касание внутри панели «Сказать фразу»: игнор
    expect(plays).toHaveLength(0)
    fire('pointerdown') // свободное касание: прогрев случился
    expect(plays).toHaveLength(1)
    expect(log.soundEvents()).toMatchObject([{ kind: 'unlock-wav', src: 'wav' }])
    expect(listeners.pointerdown?.size ?? 0).toBe(0)
  })

  it('playPrimed при удержании возвращает null (озвучка таблицы молчит во время записи)', () => {
    const release = quiet.holdSoundQuiet()
    expect(primed.playPrimed('x.mp3')).toBe(null)
    release()
  })
})

describe('onGesture и usePreloadSoundsOnTap читают флаг (исходники)', () => {
  it('sounds.js: onGesture проверяет isMicBusy ДО disarm; хук схемы — до off()', async () => {
    const { readFileSync } = await import('node:fs')
    const s = readFileSync(new URL('./sounds.js', import.meta.url), 'utf8')
    const g = s.slice(s.indexOf('function onGesture'), s.indexOf('function armGesture'))
    expect(g.indexOf('isMicBusy()')).toBeGreaterThan(-1)
    expect(g.indexOf('isMicBusy()')).toBeLessThan(g.indexOf('disarmGesture()'))
    const h = readFileSync(new URL('../../features/lessons/usePreloadSoundsOnTap.js', import.meta.url), 'utf8')
    expect(h).toMatch(/const fire = \(\) => \{ if \(isMicBusy\(\)\) return; off\(\)/)
  })
})
