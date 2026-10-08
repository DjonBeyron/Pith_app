import { describe, it, expect } from 'vitest'
import { correctPlacement } from './solveCorrect.js'

// shuffled — форма useAnswerOrder в usePhraseAssembly: {text, distractorId}
const chip = (text, distractorId = null) => ({ text, distractorId })

describe('correctPlacement — авто-ответ админа в «собери фразу»', () => {
  it('кладёт слова фразы по порядку, ловушки не трогает', () => {
    const shuffled = [chip('cook'), chip('tries', 'd1'), chip('to'), chip('He'), chip('try', 'd2')]
    const placed = correctPlacement(shuffled, ['He', 'try', 'to', 'cook'])
    expect(placed.map(p => p.word)).toEqual(['He', 'try', 'to', 'cook'])
    expect(placed.map(p => p.shuffleIdx)).toEqual([3, 4, 2, 0])
    // Чип-ловушка с тем же текстом, что слово фразы — distractorId уезжает в placed как при тапе
    expect(placed[1].distractorId).toBe('d2')
  })

  it('регистр не важен (как у проверки), повтор слова берёт второй чип', () => {
    const shuffled = [chip('was'), chip('I'), chip('was'), chip('it')]
    const placed = correctPlacement(shuffled, ['i', 'WAS', 'it', 'was'])
    expect(placed.map(p => p.shuffleIdx)).toEqual([1, 0, 3, 2])
  })

  it('слова без чипа — null (панель не трогаем)', () => {
    expect(correctPlacement([chip('a')], ['a', 'b'])).toBeNull()
    expect(correctPlacement([chip('a')], ['a', 'a'])).toBeNull()
  })

  it('пустая фраза — пустая строка ответа', () => {
    expect(correctPlacement([chip('a')], [])).toEqual([])
  })
})
