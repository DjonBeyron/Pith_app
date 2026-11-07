import { describe, it, expect } from 'vitest'
import { plateText } from './wordLanePlateText.js'

describe('текст плашки (wordLanePlateText.js)', () => {
  const ann = { type: 'announce', round: { title: 'Фразы', task: 'выбери фразу, потом скажи' } }
  it('объявление — «название\\nзадание», ход ученика — «Теперь твоя очередь», остальное — пусто', () => {
    expect(plateText(ann)).toBe('Фразы\nвыбери фразу, потом скажи')
    expect(plateText({ type: 'announce', round: { title: 'Пойми', task: 'длинно', brief: 'Тапни фразу' } })).toBe('Пойми\nТапни фразу')
    expect(plateText({ type: 'turn' })).toBe('Теперь твоя очередь')
    expect(plateText({ type: 'student' }, 'подпись')).toBe('')
  })
  it('подпись неозвученной реплики — третьей строкой; у объявления без названия плашка из одной подписи', () => {
    expect(plateText(ann, 'теперь фразы')).toBe('Фразы\nвыбери фразу, потом скажи\nтеперь фразы')
    expect(plateText({ type: 'announce', round: { title: '', task: '' } })).toBe('')
    expect(plateText({ type: 'announce', round: { title: '', task: '' } }, 'а теперь давай повысим скорость')).toBe('\n\nа теперь давай повысим скорость')
  })
})
