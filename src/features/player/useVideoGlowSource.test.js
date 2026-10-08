import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { videoGlowAudible } from './useVideoGlowSource.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
const el = (over = {}) => ({ paused: false, ended: false, muted: false, volume: 1, ...over })

describe('videoGlowAudible: когда звук видео реально звучит', () => {
  it('играет без muted — да; на паузе/доиграл/muted/volume 0 — нет', () => {
    expect(videoGlowAudible(el(), null, false)).toBe(true)
    expect(videoGlowAudible(el({ paused: true }), null, false)).toBe(false)
    expect(videoGlowAudible(el({ ended: true }), null, false)).toBe(false)
    expect(videoGlowAudible(el({ muted: true }), null, false)).toBe(false)  // autoplay-muted петля
    expect(videoGlowAudible(el({ volume: 0 }), null, false)).toBe(false)
    expect(videoGlowAudible(null, null, false)).toBe(false)
  })

  it('«без звука» из шапки: немой элемент светит, только если модуль играл бы со звуком', () => {
    expect(videoGlowAudible(el({ muted: true }), () => true, true)).toBe(true)
    expect(videoGlowAudible(el({ muted: true }), () => false, true)).toBe(false)
    expect(videoGlowAudible(el({ muted: true }), () => true, false)).toBe(false) // muted не из-за шапки
    expect(videoGlowAudible(el({ muted: true, paused: true }), () => true, true)).toBe(false)
  })
})

describe('все источники звука урока публикуют уровень свечения', () => {
  it('видео в пузыре, полный экран, кружок, видео-стикер — через useVideoGlowSource', () => {
    const hook = read('./useVideoGlowSource.js')
    // Слушаем события самого элемента, включая смену muted (volumechange)
    expect(hook).toContain("['play', 'playing', 'pause', 'ended', 'volumechange', 'emptied']")
    expect(read('./modules/video/VideoModule.jsx')).toContain('useVideoGlowSource(videoRef, src,')
    expect(read('./modules/video/useVideoFullscreen.jsx')).toContain('useVideoGlowSource(fsVideoRef, fsSrc,')
    expect(read('./modules/circle/CircleModule.jsx')).toContain('useVideoGlowSource(vRef, src,')
    expect(read('./modules/sticker/StickerModule.jsx')).toContain('useVideoGlowSource(videoRef, src,')
  })

  it('голосовое и таблица-показ — useAudioGlowSource; диктор (и прогретый элемент) и слова — напрямую', () => {
    expect(read('./modules/audio/AudioModule.jsx')).toContain('useAudioGlowSource(audioRef,')
    expect(read('./modules/table/TableDemoModule.jsx')).toContain('useAudioGlowSource(audioRef,')
    // Диктант: источник — ведущий элемент из audioRef, им может быть и прогретый
    // <audio> из primedAudio.js (у него есть tagName), часы без звука — нет
    const raf = read('./panels/table-dictator/useTableDictatorRaf.js')
    expect(raf).toContain('const glowEl = audioRef.current?.tagName ? audioRef.current : null')
    expect(raf).toContain('publishLevel(glowEl,')
    expect(read('./word-audio/wordAudioPlayer.js')).toContain('publishLevel(GLOW_ID,')
    // Ручная таблица озвучивает слова через playWord — тот же источник
    expect(read('./panels/table-manual/TableManualPanel.jsx')).toContain('playWord(')
  })

  it('звуки интерфейса — через onSoundPlayed из sounds.js (shared/lib фич не импортирует)', () => {
    const sounds = read('../../shared/lib/sounds.js')
    expect(sounds).toContain('export function onSoundPlayed(cb)')
    expect(sounds).toContain('notifyPlayed(name, audio.duration)')
    expect(sounds).not.toMatch(/from '\.\.\/\.\.\/features/)
    expect(read('./AudioGlow.jsx')).toContain('startUiSoundGlow()')
  })
})
