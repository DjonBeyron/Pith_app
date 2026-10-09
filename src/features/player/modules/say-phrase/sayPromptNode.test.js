import { describe, it, expect } from 'vitest'
import { sayPromptNode, TONE_COLORS } from './sayPromptNode.js'
import { setChatTones, getChatTones } from './sayChatTones.js'

describe('пузырь фразы в чате: подсветка слов после проверки', () => {
  const data = { phrase: 'I am trying to please', translation: '' }
  const colored = n => n.typeData.text.highlights.filter(h => h.mode === 'text' && Object.values(TONE_COLORS).includes(h.color))
    .map(h => `${n.typeData.text.content.slice(h.start, h.end)}:${h.color === TONE_COLORS.ok ? 'ok' : 'miss'}`)

  it('без тонов — как раньше: фраза белая жирная, просьба серая', () => {
    const n = sayPromptNode({ id: 'x' }, data)
    expect(colored(n)).toEqual([])
    expect(n.typeData.text.content).toBe('I am trying to please\nСкажите фразу вслух')
  })

  it('тона по словам: услышанные зелёные, пропущенные красные, нейтральные не красятся', () => {
    const n = sayPromptNode({ id: 'x' }, data, ['ok', 'ok', 'miss', null, 'miss'])
    expect(colored(n)).toEqual(['I:ok', 'am:ok', 'trying:miss', 'please:miss'])
  })

  it('отступы слов считаются по пробельным группам (двойные пробелы, знаки)', () => {
    const n = sayPromptNode({ id: 'x' }, { phrase: "I'm  here, please." }, ['miss', 'ok', 'ok'])
    expect(colored(n)).toEqual(["I'm:miss", 'here,:ok', 'please.:ok'])
  })

  it('хранилище тонов: запись/сброс по id ноды', () => {
    setChatTones('n1', ['ok'])
    expect(getChatTones('n1')).toEqual(['ok'])
    setChatTones('n1', null)
    expect(getChatTones('n1')).toBe(null)
  })
})
