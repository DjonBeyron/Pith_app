import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Порядок жеста «включить звук» (iOS): play() видео — последним, аудио сцен на жесте видео — только через
// unlockSceneAudioFromVideoGesture (на iOS пропускается). Проверка по тексту исходников.
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')
const idx = (s, re) => s.search(re)

describe('порядок жеста звука', () => {
  const slide = read('./SlideVideo.jsx')
  const act = slide.slice(idx(slide, /function activateSound/), idx(slide, /function soundToggleAllowed/))

  it('SlideVideo.activateSound: onSoundOn → unlockAllForSound → play() самого видео последним', () => {
    const a = idx(act, /onSoundOn\?\.\(\)/), b = idx(act, /unlockAllForSound\(\)/), c = idx(act, /v\.play\(\)/)
    expect(a).toBeGreaterThan(-1)
    expect(a).toBeLessThan(b)
    expect(b).toBeLessThan(c)
    expect(act.slice(c)).not.toMatch(/onSoundOn|unlockSceneAudio/)
  })

  it('шапка: onSoundOn раньше unlockAllForSound', () => {
    const h = read('./FeedTabsHeader.jsx')
    expect(idx(h, /onSoundOn\?\.\(\)/)).toBeLessThan(idx(h, /unlockAllForSound\(\)/))
  })

  it('useFeedSound на жесте видео зовёт только безопасный вариант', () => {
    const s = read('./useFeedSound.js')
    expect(s).toMatch(/unlockSceneAudioFromVideoGesture\(\)/)
    expect(s).not.toMatch(/[^a-zA-Z]unlockSceneAudio\(\)/)
  })

  it('слайд-сцена: тап по сцене открывает аудио, чип и тап учитывают iOS-блокировку', () => {
    const p = read('./scene/useSlideScenePlay.js')
    expect(p).toMatch(/sceneNeedsOwnGesture\(\)/)
    expect(p).toMatch(/unlockSceneAudio\(\)/)
    expect(read('./scene/SlideScene.jsx')).toMatch(/useSceneNeedsGesture\(\)/)
  })

  it('DBG-панель показывает секцию звука', () => {
    expect(read('./DebugPanel.jsx')).toMatch(/feedSoundReport\(\)/)
  })
})
