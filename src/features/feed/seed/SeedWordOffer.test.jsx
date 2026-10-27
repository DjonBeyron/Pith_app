import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SeedWordOffer from './SeedWordOffer.jsx'

describe('SeedWordOffer', () => {
  const html = renderToStaticMarkup(<SeedWordOffer word="keep" onSave={() => {}} onDecline={() => {}} />)

  it('слово, текст и две кнопки', () => {
    expect(html).toContain('keep')
    expect(html).toContain('Чтобы не забыть слово, сохрани его')
    expect(html.match(/<button/g)).toHaveLength(2)
    expect(html).toContain('Сохранить')
    expect(html).toContain('Не сейчас')
  })
  it('слов «память» и «вкладка» в тексте нет', () => {
    expect(html.toLowerCase()).not.toMatch(/памят|вкладк/)
  })
})
