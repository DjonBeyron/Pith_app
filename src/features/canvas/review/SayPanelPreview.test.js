import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SayPanelPreview from './SayPanelPreview.jsx'

describe('режим разбора: панель «Сказать фразу» из настоящих частей', () => {
  const html = (data, line) => renderToStaticMarkup(createElement(SayPanelPreview, { data, line }))

  it('круг-микрофон в состоянии «ready», надпись, «Послушать» и «Я не могу говорить», круг не нажимается', () => {
    const h = html({ phrase: 'I need to talk to you' }, 'I need to talk to you')
    expect(h).toContain('sayMicBox--ready')
    expect(h).toContain('Нажмите, чтобы говорить')
    expect(h).toContain('Послушать')
    expect(h).toContain('data-testid="say-skip"')
    expect(h).toMatch(/data-testid="say-mic"[^>]*>|disabled=""[^>]*data-testid="say-mic"/)
    expect(h).toContain('disabled=""')
    expect(h).toContain('I need to talk to you')
  })

  it('свободная фраза (pattern) и listenAudio: false — «Послушать» неактивна', () => {
    expect(html({ pattern: 'I want to **' }, 'I want to **')).toContain('sayLink--off')
    expect(html({ phrase: 'x', listenAudio: false })).toContain('sayLink--off')
    expect(html({ phrase: 'x' })).not.toContain('sayLink--off')
  })
})
