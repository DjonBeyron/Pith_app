import { describe, it, expect } from 'vitest'
import { setSceneLine } from './sceneLineEdit.js'

const scene = { timeline: [
  { who: 'a', text: 'Привет', audioUrl: 'https://r2/a.mp3', wordTimings: [{ word: 'x', start: 0, end: 1 }], audioMeta: { hash: 'h' }, translation: 'Hi', translationAudioUrl: 'https://r2/t.mp3' },
  { who: 'a', text: 'Пока', audioUrl: 'https://r2/b.mp3' },
] }

describe('правка реплики сцены в разборе', () => {
  it('новый текст сбрасывает озвучку оригинала этой реплики, остальные реплики и перевод не трогает', () => {
    const out = setSceneLine(scene, 0, { text: 'Здравствуй' })
    expect(out.timeline[0]).toEqual({ who: 'a', text: 'Здравствуй', translation: 'Hi', translationAudioUrl: 'https://r2/t.mp3' })
    expect(out.timeline[1]).toBe(scene.timeline[1])
    expect(scene.timeline[0].text).toBe('Привет') // исходный снимок не мутируется
  })
  it('тот же текст — озвучка остаётся; новый перевод сбрасывает озвучку перевода; пустой перевод убирает поле', () => {
    expect(setSceneLine(scene, 0, { text: 'Привет' }).timeline[0].audioUrl).toBe('https://r2/a.mp3')
    const tr = setSceneLine(scene, 0, { translation: 'Hello' }).timeline[0]
    expect(tr.translation).toBe('Hello'); expect(tr.translationAudioUrl).toBeUndefined(); expect(tr.audioUrl).toBe('https://r2/a.mp3')
    expect('translation' in setSceneLine(scene, 0, { translation: '' }).timeline[0]).toBe(false)
  })
  it('мусор (нет сцены / нет реплики) возвращается как есть', () => {
    expect(setSceneLine(null, 0, { text: 'x' })).toBe(null)
    expect(setSceneLine(scene, 9, { text: 'x' })).toBe(scene)
  })
})
