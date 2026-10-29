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
