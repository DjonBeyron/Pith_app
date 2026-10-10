import { describe, it, expect, afterEach } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AnswerBubbles from '../AnswerBubbles.jsx'
import { putSayVoice, revokeSayVoice, clearSayVoices } from '../../../../shared/lib/speech/sayVoiceStore.js'

// Пузырь-голосовое ученика («Сказать фразу», режим «голосовое с текстом»): разметка через renderToStaticMarkup (testing-library/jsdom в проекте нет).
// Верная и неверная реплики остаются в своём стиле (✓ / ✕, responseOk / responseErr), внутри — плеер; нет клипа — обычный текстовый пузырь, как раньше.
const clip = () => putSayVoice(new Blob([new Uint8Array(64)], { type: 'audio/wav' }), { durationMs: 2300, peaks: [0.2, 0.8, 1, 0.5] })
const render = bubbles => renderToStaticMarkup(createElement(AnswerBubbles, { bubbles, nodeId: 'n1', confetti: false }))

describe('AnswerBubbles: реплики ученика с голосовым', () => {
  afterEach(() => clearSayVoices())

  it('верная: пузырь responseOk + voice, кнопка «Прослушать свой ответ», <audio> по blob-URL, длительность 00:02, текст под плеером со знаком ✓', () => {
    const html = render([{ text: 'I like tea', result: 'correct', voiceId: clip() }])
    expect(html).toContain('playerMsgBubble--responseOk')
    expect(html).toContain('playerMsgBubble--voice')
    expect(html).toContain('aria-label="Прослушать свой ответ"')
    expect(html).toMatch(/<audio[^>]*src="blob:[^"]+"[^>]*data-say-voice/)
    expect(html).toContain('data-voice')
    expect(html).toContain('playerAudioDur')
    expect(html).toContain('00:02')
    expect(html).toMatch(/<span class="sayVoiceText sayVoiceText--ok">I like tea<\/span>/)
    expect(html).toContain('playerAudioWave') // статичная волна по peaks
    expect(html).toContain('playerSheen') // блик верного ответа сохранён
  })

  it('неверная (wrong_final): остаётся в красном стиле responseErr, знак ✕, плеер внутри', () => {
    const html = render([{ text: 'I likes tea', result: 'wrong_final', voiceId: clip() }])
    expect(html).toContain('playerMsgBubble--responseErr')
    expect(html).toContain('playerMsgBubble--voice')
    expect(html).toContain('aria-label="Прослушать свой ответ"')
    expect(html).toContain('sayVoiceText--err')
    expect(html).not.toContain('playerSheen')
  })

  it('каждая попытка — своё голосовое: три пузыря, три плеера, у каждого свой blob-URL', () => {
    const html = render([
      { text: 'a one', result: 'wrong_final', voiceId: clip() },
      { text: 'b two', result: 'wrong_final', voiceId: clip() },
      { text: 'c three', result: 'correct', voiceId: clip() },
    ])
    const urls = [...html.matchAll(/<audio[^>]*src="(blob:[^"]+)"/g)].map(m => m[1])
    expect(urls).toHaveLength(3)
    expect(new Set(urls).size).toBe(3)
    expect(html.match(/aria-label="Прослушать свой ответ"/g)).toHaveLength(3)
  })

  it('клипа нет в реестре (выселен лимитом, шаг назад, режим выключен) — обычный текстовый пузырь без плеера', () => {
    const id = clip(); revokeSayVoice(id)
    for (const b of [{ text: 'I like tea', result: 'correct', voiceId: id }, { text: 'I like tea', result: 'correct' }, { text: 'I likes', result: 'wrong_final', voiceId: 'sv999' }]) {
      const html = render([b])
      expect(html).not.toContain('<audio')
      expect(html).not.toContain('playerMsgBubble--voice')
      expect(html).not.toContain('Прослушать')
      expect(html).toContain(b.text)
    }
  })

  it('подсказка ведущего (hint) слева и чужие модули голосового не получают', () => {
    const html = render([{ text: 'Try again', result: 'hint', voiceId: clip() }])
    expect(html).not.toContain('<audio')
    expect(html).toContain('Try again')
  })
})
