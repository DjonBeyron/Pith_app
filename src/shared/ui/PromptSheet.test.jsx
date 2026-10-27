import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import PromptSheet from './PromptSheet.jsx'

const base = { id: 'q1', kind: 'question', text: 'Как тебе слова из видео?', answers: [{ id: 'easy', label: 'Легко' }, { id: 'ok', label: 'Норм' }, { id: 'hard', label: 'Сложно' }] }
const html = p => renderToStaticMarkup(<PromptSheet prompt={p} />)
const count = (s, re) => (s.match(re) ?? []).length

// Вид шторки — статическим рендером (в проекте нет DOM-среды; реплика с таймером и смахивание — на устройстве)
describe('PromptSheet', () => {
  it('prompt === null — ничего не рисует', () => {
    expect(html(null)).toBe('')
  })
  it('кандидат без text (ленточные «Ловля», подсказки) шторкой не рисуется', () => {
    expect(html({ id: 'catch:m1', kind: 'offer' })).toBe('')
  })
  it('кружок Пита, текст, ответы и крестик', () => {
    const h = html(base)
    expect(h).toContain('Как тебе слова из видео?')
    expect(h).toContain('<img')
    expect(h).toContain('width="40"')
    expect(h).toContain('aria-label="Закрыть"')
    expect(count(h, /promptSheetBtn"/g)).toBe(3)
    ;['Легко', 'Норм', 'Сложно'].forEach(l => expect(h).toContain(l))
  })
  it('ответов не больше трёх', () => {
    const many = { ...base, answers: [...base.answers, { id: 'x', label: 'Четвёртый' }] }
    const h = html(many)
    expect(count(h, /promptSheetBtn"/g)).toBe(3)
    expect(h).not.toContain('Четвёртый')
  })
  it('класс по виду', () => {
    ;['question', 'hint', 'offer', 'reminder'].forEach(kind => {
      expect(html({ ...base, kind })).toContain(`promptSheet--${kind}`)
    })
  })
  it('«Спроси позже» — только при later', () => {
    expect(html(base)).not.toContain('Спроси позже')
    expect(html({ ...base, later: true })).toContain('Спроси позже')
  })
  it('без ответов кнопок-ответов нет, крестик остаётся', () => {
    const h = html({ ...base, answers: undefined })
    expect(count(h, /promptSheetBtn"/g)).toBe(0)
    expect(h).toContain('aria-label="Закрыть"')
  })
})
