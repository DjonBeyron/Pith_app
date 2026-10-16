import { describe, it, expect } from 'vitest'
import { SCENES_HELP } from './scenesHelp.js'
import { PICK_LABEL, PICK_LEVELS } from './varsOps.js'
import { buildPrompt } from './aiPrompt.js'
import { sceneLegendText } from '../../scene/v2/sceneLegend.js'
import { VARS_BLOCK_NAME, VARS_HOW, VARS_EXAMPLES, varsHowBody } from './varsHowTexts.js'

// Названия блока «Слова пользователя» и «?»-пояснение единые везде: подсказка, промпт нейросети, легенда
describe('названия и пояснение блока «Слова пользователя»', () => {
  it('в подсказках, промпте и легенде нет старых названий', () => {
    const all = JSON.stringify(SCENES_HELP) + buildPrompt('кофе', { withVars: true }) + sceneLegendText()
    expect(all).not.toMatch(/Слова-переменные|шатающ|ступен/i)
    expect(SCENES_HELP.vars.title).toContain(VARS_BLOCK_NAME)
  })
  it('«?» блока объясняет всё: что видит админ, что получит пользователь, ограничения, пример до/после', () => {
    const h = SCENES_HELP.vars
    expect(VARS_HOW.map(s => s.key)).toEqual(['admin', 'user', 'limits'])
    expect(h.body).toBe(varsHowBody())
    for (const w of ['{food}', 'запасное слово', 'Прогнать как пользователь', 'библиотеки', 'роботизирован', 'cheese', 'soup', 'идиом']) expect(h.body).toContain(w)
    expect(h.body).not.toMatch(/пока не подключ|следующий шаг|на следующем этапе/)
    expect(h.example).toContain('Can I have {food}, please? → Can I have cheese, please?')
    expect(VARS_EXAMPLES).toHaveLength(3)
    expect(SCENES_HELP.vars_sandbox.body).toContain('Прогнать как пользователь')
  })
  it('подписи типов отбора — по стандарту уровней; логика (ключи pick) не менялась', () => {
    expect(PICK_LABEL).toEqual({ weak: 'Новые слова (уровень 1, зелёные)', due: 'Пора повторить (просрочены)', known: 'Знакомые и выше (уровни 2–4)' })
    expect(PICK_LEVELS).toEqual({ weak: [1], due: [], known: [2, 3, 4] })
    expect(SCENES_HELP.vars_pick.body).not.toMatch(/шатающ|ступен/i)
  })
})
