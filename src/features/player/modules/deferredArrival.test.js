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
  const hook = read('../panels/usePanelRiseDrop.js')

  it('строки в arriving помечены data-no-slide и невидимы', () => {
    expect(wc).toContain("const noSlide = arriving ? { 'data-no-slide': 'true' } : {}")
    expect(wc).toContain("playerMsgRowArriving")
    expect(css).toContain('.playerMsgRowArriving { visibility: hidden; }')
  })

  it('PlayerFeed не въезжает такие строки и не толкает историю', () => {
    expect(feed).toContain("!el.closest('[data-no-slide]')")
    expect(feed).toContain('if (existingRows.length && shiftPx > 0)')
  })

  it('панель вставляет пузыри с arriving одним тиком с закрытием, проявление — с остановки истории (хук)', () => {
    expect(panels).toContain('handleWordAnswer(wcNode.id, text, result, true)')
    expect(panels).toContain('onRevealAnswer={() => handleWordReveal(wcNode.id)}')
    const close = panel.slice(panel.indexOf('rise.prepareClose({ reveal: {'))
    // порядок: prepareClose → пузыри → setShow(false) в одном колбэке
    expect(close.indexOf('onAnswered?.(responseText, result)')).toBeLessThan(close.indexOf('setShow(false)'))
    // reveal планирует общий хук на historyStopMs из playPanelDrop
    expect(hook).toContain('flushSync(() => reveal.onReveal?.())')
    expect(hook).toContain('}, historyStopMs))')
    expect(read('../panels/panelRise.js')).toContain('return { anim, historyStopMs }')
  })

  it('спуск меряется по опоре — с учётом места, занятого пузырями', () => {
    expect(hook).toContain('a.el.getBoundingClientRect().top - a.top')
  })
})

// Таблица (ручная) — тот же приём через phraseStates/AnswerBubbles
describe('отложенный приход ответа ручной таблицы', () => {
  const bubbles = read('./AnswerBubbles.jsx')
  const close = read('../panels/table-manual/manualClose.js')
  const check = read('../panels/table-manual/manualCheck.js')
  const panels = read('../PlayerPanels.jsx')
  const answers = read('../usePlayerAnswers.js')

  it('AnswerBubbles: строки с arriving — без въезда и невидимы, проявляются только они', () => {
    expect(bubbles).toContain("...(b.arriving ? { 'data-no-slide': 'true' } : {})")
    expect(bubbles).toContain('playerMsgRowArriving')
    expect(bubbles).toContain('useDeferredArrival(anyArriving, rowsRef, { indices: arrivingIdx })')
  })

  it('manualClose: обычное закрытие — пузыри отложенные (deferred=true) одним тиком с setShow(false); уход в чат — обычные', () => {
    const normal = close.slice(close.indexOf('rise.prepareClose('))
    expect(normal.indexOf('sendBubbles?.(true)')).toBeLessThan(normal.indexOf('setShow(false)'))
    expect(close).toContain('if (sendBubbles) flushSync(() => sendBubbles(false))')
    expect(check).toContain("onAnswerToChat?.(phrase, 'correct', deferred)")
  })

  it('флаг доходит до phraseStates, reveal снимает его', () => {
    expect(panels).toContain('handlePhraseAnswer(tableNode.id, text, result, arriving)')
    expect(panels).toContain('onRevealAnswer={() => revealPhraseAnswers(tableNode.id)}')
    expect(answers).toContain('function revealPhraseAnswers(nodeId)')
  })
})

// «Собери фразу» — тот же приём (панель → phraseStates → AnswerBubbles)
describe('отложенный приход ответа «собери фразу»', () => {
  const panel = read('../panels/phrase-assembly/PhraseAssemblyPanel.jsx')
  const panels = read('../PlayerPanels.jsx')

  it('верный и третий неверный закрываются через closeWith: prepareClose → пузыри arriving → setShow(false)', () => {
    const body = panel.slice(panel.indexOf('function closeWith('))
    expect(body.indexOf('rise.prepareClose({ reveal: {')).toBeLessThan(body.indexOf('sendBubbles()'))
    expect(body.indexOf('sendBubbles()')).toBeLessThan(body.indexOf('setShow(false)'))
    expect(panel).toContain("onAnswered?.(phrase, 'correct', true)")
    expect(panel).toContain("onAnswered?.(phrase, 'wrong_final', true)")
  })

  it('салют — из панели по галочке награды, XP ждёт пузырь', () => {
    expect(panel).toContain("if (isRewardOn('phrase_assembly', pa)) {")
    expect(panel).toContain('onXpEarned?.(xpAmount, { expectBubble: true })')
    expect(panels).toContain('handlePhraseAnswer(paNode.id, text, result, arriving)')
    expect(panels).toContain('onRevealAnswer={() => revealPhraseAnswers(paNode.id)}')
  })
})
