import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReadKaraoke from './ReadKaraoke.jsx'

// Разметка читки-караоке: те же .wlHead, слова по отдельности с зелёным слоем, один узел курсора
const heads = [{ text: "I'm", on: true }, { text: 'trying', on: true }, { text: 'to learn', on: true }]
const chunks = heads.map(h => h.text)
const metro = [{ chunk: 0, at: 0, ms: 300 }, { chunk: 1, at: 400, ms: 400 }, { chunk: 2, at: 900, ms: 600 }]
const html = (o = {}) => renderToStaticMarkup(<ReadKaraoke heads={heads} stage={{ type: 'read', metro }} at={0} chunks={chunks} live={null} ready={false} lite={false} {...o} />)

describe('ReadKaraoke: разметка', () => {
  it('подписи дорожек — те же wl-head-N (тест-идентификаторы игры), слова по отдельности, слой заливки с текстом из data-t', () => {
    const out = html()
    for (const i of [0, 1, 2]) expect(out).toContain(`data-testid="wl-head-${i}"`)
    expect((out.match(/class="rkWord"/g) ?? [])).toHaveLength(4) // I'm, trying, to, learn
    expect(out).toContain('data-testid="rk-word-2-1"'); expect(out).toContain('data-t="learn"')
    expect(out.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'")).toBe("I'mtryingto learn") // текст страницы не дублируется слоем заливки
  })
  it('слой заливки скрыт от чтения с экрана; курсор — один узел с «|» и кружком, последний ребёнок контейнера', () => {
    const out = html()
    expect(out).toContain('class="rkFill" data-t="to" aria-hidden="true"')
    expect((out.match(/class="rkCursor"/g) ?? [])).toHaveLength(1)
    expect(out).toContain('<b class="rkBar"></b><b class="rkDot"></b>')
    expect(out.trim().endsWith('</i>')).toBe(true)
  })
  it('стадия «твоя очередь» — зелёное уходит (rkHead--off); читка Пита и игрока — нет', () => {
    expect(html({ stage: { type: 'turn' } })).toContain('rkHead--off')
    expect(html()).not.toContain('rkHead--off')
    expect(html({ stage: { type: 'student', metro } })).not.toContain('rkHead--off')
  })
  it('lite (слабое устройство): курсор спрятан классом, слова те же', () => {
    const out = html({ lite: true })
    expect(out).toContain('rkCursor rkCursor--off'); expect((out.match(/class="rkWord"/g) ?? [])).toHaveLength(4)
  })
  it('пустая подпись (Пит говорит реплику) — без слов и прозрачная; яркость как в игре (on)', () => {
    const out = html({ heads: [{ text: '', on: false }, { text: 'trying', on: true }, { text: '', on: false }] })
    expect(out).toContain('wlHead rkHead wlHead--empty'); expect((out.match(/class="rkWord"/g) ?? [])).toHaveLength(1)
    expect(out).toContain('wlHead rkHead wlHead--on')
  })
})
