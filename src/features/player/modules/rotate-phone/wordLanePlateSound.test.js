import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Звук плашки игры «Повтори за диктором» (wordLanePlateSound.js): короткий тихий блюп ≤ 150 мс; слот просыпается в тапе «Начать» вместе с нотами, полная тишина и «без звука» в уроке его глушат
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

describe('звук плашки', () => {
  it('WAV: ≤ 150 мс, 16 бит моно, тихий (RMS вдвое ниже нот награды), без щелчков на краях (вход и затухание)', async () => {
    const { makePlateWav, PLATE_MS, PLATE_RMS } = await import('./wordLanePlateSound.js')
    const { TARGET_RMS, wavRms } = await import('./wordLaneNotes.js')
    const wav = makePlateWav()
    const v = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(v.getUint16(22, true)).toBe(1)                                // моно
    expect(v.getUint16(34, true)).toBe(16)                               // 16 бит
    const ms = ((wav.length - 44) / 2 / v.getUint32(24, true)) * 1000
    expect(ms).toBeLessThanOrEqual(150)
    expect(ms).toBeCloseTo(PLATE_MS, 0)
    expect(wavRms(wav)).toBeCloseTo(PLATE_RMS, -1)
    expect(wavRms(wav)).toBeLessThanOrEqual(TARGET_RMS / 2 + 1)
    expect(Math.abs(v.getInt16(44, true))).toBeLessThan(200)             // начало с нуля
    expect(Math.abs(v.getInt16(wav.length - 2, true))).toBeLessThan(200) // и конец в ноль
    let peak = 0
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(v.getInt16(i, true)))
    expect(peak).toBeLessThanOrEqual(12000)
  })
  describe('проигрывание: слот просыпается в тапе, тишина и «без звука» его глушат', () => {
    const made = []
    let audio
    beforeEach(() => {
      made.length = 0
      globalThis.Audio = class { constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; this.plays = 0; this.paused = true; made.push(this) } play() { this.plays++; return Promise.resolve() } pause() { this.paused = true } load() {} removeAttribute() { this.src = '' } }
      URL.createObjectURL = () => `blob:wl-${Math.random()}`
      URL.revokeObjectURL = () => {}
      audio = null
    })
    afterEach(async () => { (await import('./wordLanePlateSound.js')).releasePlate(); delete globalThis.Audio; vi.resetModules() })
    it('без unlockPlate (не из тапа) — не играет; после unlockPlate играет; releasePlate — снова нет', async () => {
      const m = await import('./wordLanePlateSound.js')
      expect(m.playPlate()).toBe(false)
      m.unlockPlate()
      expect(made).toHaveLength(1)
      audio = made[0]
      expect(audio.plays).toBe(1)                                         // «разбудили» тихим звуком в жесте
      await Promise.resolve(); await Promise.resolve()
      expect(audio.src).toMatch(/^blob:wl-/)
      expect(m.playPlate()).toBe(true)
      expect(audio.plays).toBe(2)
      m.releasePlate()
      expect(m.playPlate()).toBe(false)
    })
    it('полная тишина приложения (holdSilence) и «без звука» в уроке молчат', async () => {
      const m = await import('./wordLanePlateSound.js')
      const { holdSilence } = await import('../../../../shared/lib/soundQuiet.js')
      const { setLessonMuted } = await import('../../lessonVolume.js')
      m.unlockPlate()
      const a = made[0]
      const before = a.plays
      const release = holdSilence('test')
      expect(m.playPlate()).toBe(false)
      release()
      setLessonMuted(true)
      expect(m.playPlate()).toBe(false)
      setLessonMuted(false)
      expect(a.plays).toBe(before)                                        // за это время элемент ни разу не стартовал
      expect(m.playPlate()).toBe(true)
    })
    it('диагностика: каждое проигрывание оставляет строку «[plate-sound] play() → …» и событие plate-sound; отклонённое пробуждение слота тоже в журнале', async () => {
      const { getPlayerLines } = await import('../../../../shared/lib/debug.js')
      const { setGameAudioSink } = await import('../../../../shared/lib/gameAudioSink.js')
      const events = []
      setGameAudioSink((k, d) => events.push([k, d]))
      const m = await import('./wordLanePlateSound.js')
      m.unlockPlate()
      await Promise.resolve(); await Promise.resolve()
      expect(m.playPlate()).toBe(true)
      await Promise.resolve(); await Promise.resolve()
      expect(events.find(e => e[0] === 'plate-sound')[1]).toMatchObject({ play: 'ok' })
      expect(getPlayerLines().some(l => l.includes('[plate-sound] play() → ok'))).toBe(true)
      made[0].play = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
      expect(m.playPlate()).toBe(true)
      await Promise.resolve(); await Promise.resolve()
      expect(events.filter(e => e[0] === 'plate-sound').at(-1)[1]).toMatchObject({ play: 'rejected', error: 'NotAllowedError' })
      expect(getPlayerLines().some(l => l.includes('[plate-sound] play() → отклонён (NotAllowedError)'))).toBe(true)
      m.releasePlate()
      globalThis.Audio = class extends made[0].constructor { play() { return Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })) } }
      m.unlockPlate()
      await Promise.resolve(); await Promise.resolve()
      expect(events.some(e => e[0] === 'plate-sound' && e[1].wake === 'rejected')).toBe(true)
      setGameAudioSink(null)
    })
    it('пробуждение плашки прервано (AbortError — iOS прервал сессию) — не отказ: звук подставляется, событие wake=aborted; отказ старого элемента после releasePlate ничего не пишет', async () => {
      const { setGameAudioSink } = await import('../../../../shared/lib/gameAudioSink.js')
      const events = []
      setGameAudioSink((kind, data) => events.push([kind, data]))
      let rejectWake
      globalThis.Audio = class { constructor(src) { this.src = src; this.paused = true; made.push(this) } play() { return new Promise((_, rej) => { rejectWake = rej }) } pause() {} load() {} removeAttribute() { this.src = '' } }
      const m = await import('./wordLanePlateSound.js')
      m.unlockPlate()
      const silence = made[0].src
      await Promise.resolve()
      expect(made[0].src).toBe(silence) // play() тишины ещё не завершился — src не трогаем
      rejectWake(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
      await Promise.resolve(); await Promise.resolve()
      expect(made[0].src).not.toBe(silence)
      expect(events.find(e => e[0] === 'plate-sound')[1]).toMatchObject({ wake: 'aborted', error: 'AbortError' })
      expect(events.some(e => e[0] === 'plate-sound' && e[1].wake === 'rejected')).toBe(false)
      m.releasePlate()
      m.unlockPlate()
      const stale = rejectWake
      m.releasePlate() // новый элемент отпущен, а его play() отклоняется позже
      stale(Object.assign(new Error('x'), { name: 'AbortError' }))
      await Promise.resolve(); await Promise.resolve()
      expect(events.filter(e => e[0] === 'plate-sound')).toHaveLength(1)
      setGameAudioSink(null)
    })
    it('тап «Начать» (startGameAudio и повторный прогрев) будит слот плашки рядом с нотами, releaseNotes — отпускает; от варианта награды слот не зависит', () => {
      const start = read('./wordLaneStart.js')
      expect(start).toContain("import { unlockPlate } from './wordLanePlateSound.js'")
      expect(start).toMatch(/ {2}unlockNotes\(\)[^\n]*\n {2}unlockPlate\(\)/)
      expect(start).toContain('releaseNotes(); unlockNotes(); unlockPlate()')
      const notes = read('./wordLaneNotes.js')
      expect(notes).toContain("import { releasePlate } from './wordLanePlateSound.js'")
      expect(notes).toMatch(/export function releaseNotes\(\) \{\n {2}releasePlate\(\)/)
      expect(notes).not.toContain('unlockPlate')                                        // ноты не создают лишних <audio>: у них свои тесты на число слотов (3, при «без звука» — 0)
    })
  })
})
