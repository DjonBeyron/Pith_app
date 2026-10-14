import { describe, it, expect } from 'vitest'
import { cardHasAudio, cardNeedsSound, dropAudio } from './reviewSession.js'
import { cardFiles } from './reviewDecks.js'

// Нода scene в карточках повтора: звучит (кнопка «Не могу слушать» видна), но с
// облачками читается без звука — «Не могу слушать» её НЕ убирает; без облачков — убирает
const scene = (td = {}) => ({ type: 'scene', typeData: { scene: { scene: { version: 2, timeline: [{ who: 'a', text: 'Привет.' }] }, ...td } } })

describe('reviewSession — сцена', () => {
  it('карточка со сценой — «со звуком»', () => {
    expect(cardHasAudio({ nodes: [scene()] })).toBe(true)
    expect(cardHasAudio({ nodes: [{ type: 'text' }] })).toBe(false)
  })

  it('с облачками звук не обязателен, без облачков — обязателен', () => {
    expect(cardNeedsSound({ nodes: [scene()] })).toBe(false)
    expect(cardNeedsSound({ nodes: [scene({ showBubbles: false })] })).toBe(true)
  })

  it('«Не могу слушать» оставляет сцену с облачками и убирает без', () => {
    const q = [
      { key: 'a', card: { id: 'c1', nodes: [scene()] } },
      { key: 'b', card: { id: 'c2', nodes: [scene({ showBubbles: false })] } },
    ]
    expect(dropAudio({ queue: q, index: 0 }).queue.map(x => x.key)).toEqual(['a'])
  })

  it('cardFiles — у сцены только audioUrl реплик, без них файлов нет', () => {
    expect(cardFiles([scene()])).toEqual([])
    const withAudio = scene({ scene: { version: 2, timeline: [{ who: 'a', text: 'Hi.', audioUrl: 'https://r2.dev/a.mp3' }, { who: 'b', text: 'Yo.', audioUrl: 'https://r2.dev/a.mp3' }] } })
    expect(cardFiles([withAudio])).toEqual([{ id: 'https://r2.dev/a.mp3', r2Url: 'https://r2.dev/a.mp3', size: 0 }])
  })
})
