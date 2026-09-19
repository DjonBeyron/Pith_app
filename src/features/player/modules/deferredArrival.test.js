import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// «История знает высоту ответа заранее»: пузыри встают в ленту невидимыми
// тем же тиком, что закрывается панель, — PlayerFeed их не анимирует и историю
// не толкает; въезд играет useDeferredArrival, когда панель ушла
describe('отложенный приход ответа «выбери слово»', () => {
  const wc = read('./word-choice/WordChoiceModule.jsx')
  const feed = read('../PlayerFeed.jsx')
  const panels = read('../PlayerPanels.jsx')
  const panel = read('../panels/choose-word/ChooseWordPanel.jsx')
  const css = read('../../../styles/player/message.css')

  it('строки в arriving помечены data-no-slide и невидимы', () => {
    expect(wc).toContain("const noSlide = arriving ? { 'data-no-slide': 'true' } : {}")
    expect(wc).toContain("playerMsgRowArriving")
    expect(css).toContain('.playerMsgRowArriving { visibility: hidden; }')
  })

  it('PlayerFeed не въезжает такие строки и не толкает историю', () => {
    expect(feed).toContain("!el.closest('[data-no-slide]')")
    expect(feed).toContain('if (existingRows.length && shiftPx > 0)')
  })

  it('панель вставляет пузыри с arriving одним тиком с закрытием и проявляет после ухода', () => {
    expect(panels).toContain('handleWordAnswer(wcNode.id, text, result, true)')
    expect(panels).toContain('onRevealAnswer={() => handleWordReveal(wcNode.id)}')
    const close = panel.slice(panel.indexOf('anchorRef.current = last'))
    // порядок: пузыри → setShow(false) в одном колбэке, reveal — по таймеру
    expect(close.indexOf('onAnswered?.(responseText, result)')).toBeLessThan(close.indexOf('setShow(false)'))
    expect(close).toContain('flushSync(() => onRevealAnswer?.())')
  })

  it('спуск меряется по опоре — с учётом места, занятого пузырями', () => {
    expect(panel).toContain('a.el.getBoundingClientRect().top - a.top')
  })
})
