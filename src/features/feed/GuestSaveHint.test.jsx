import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import GuestSaveHint, { GuestSaveHintLine } from './GuestSaveHint.jsx'
import { GUEST_HINT_TEXT } from './guestSaveHint.js'

describe('GuestSaveHint', () => {
  it('строка: кружок Пита 28 + текст от третьего лица, это кнопка', () => {
    const html = renderToStaticMarkup(<GuestSaveHintLine onTap={() => {}} />)
    expect(html).toContain('<button')
    expect(html).toContain('width="28"')
    expect(html).toContain('Пит сохранит лайки и закладки, если создашь аккаунт — это полминуты')
    expect(GUEST_HINT_TEXT).toContain('полминуты')
  })

  it('пока слайдов после лайка не пролистано, компонент ничего не рисует', () => {
    expect(renderToStaticMarkup(<GuestSaveHint activeIdx={0} user={null} onRequireAuth={() => {}} />)).toBe('')
  })
})
