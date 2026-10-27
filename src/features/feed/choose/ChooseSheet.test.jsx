import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChooseSheet from './ChooseSheet.jsx'
import { verdictOf } from './chooseTasks.js'

// Плеер подменён заглушкой: проверяем, что получает плеер (узлы, беззвучный режим) и что рисует сама шторка
vi.mock('../../player/LessonPlayerLazy.jsx', () => ({
  default: p => <i className="playerStub" data-muted={String(!!p.muted)} data-nodes={p.nodes.map(n => n.id).join(',')} data-teacher={p.teacherName} />,
}))

const choice = { id: 'c', type: 'word_choice', typeData: { word_choice: { options: [{ text: 'keep', isCorrect: true }, { text: 'kip' }] } } }
const say = { id: 's', type: 'text', typeData: { text: { text: 'I keep it' } } }
const card = { id: 'k1', nodes: [say, choice] }
const item = over => ({ word: 'keep', card, teacher: { name: 'Анна' }, textOnly: false, result: null, ...over })
const render = it => renderToStaticMarkup(<ChooseSheet item={it} onFinishStats={() => {}} onClose={() => {}} />)

describe('ChooseSheet', () => {
  it('до ответа: плеер с нодами карточки и учителем, итога и «Дальше» нет', () => {
    const html = render(item())
    expect(html).toContain('aria-label="Выбери слово"')
    expect(html).toContain('data-nodes="s,c"')
    expect(html).toContain('data-teacher="Анна"')
    expect(html).toContain('reviewCardFrame')
    expect(html).not.toContain('Дальше')
    expect(html).not.toContain('chooseVerdict')
    expect(html).toContain('aria-label="Закрыть"')
  })

  it('текстовая версия: плеер играет беззвучно, шторка помечена', () => {
    const html = render(item({ textOnly: true }))
    expect(html).toContain('data-muted="true"')
    expect(html).toContain('chooseSheet--text')
    expect(render(item())).toContain('data-muted="false"')
  })

  it('верный ответ: «Верно!» и «Дальше»', () => {
    const html = render(item({ result: { ok: true } }))
    expect(html).toContain('Верно!')
    expect(html).toContain('chooseVerdict--ok')
    expect(html).toContain('Дальше')
  })

  it('неверный ответ: подпись называет верное слово, без красного и без цифр', () => {
    const html = render(item({ result: { ok: false } }))
    expect(html).toContain('Не то — верно: keep')
    expect(html).toContain('chooseVerdict--bad')
    expect(html).not.toMatch(/\d\s*(из|\/)\s*\d/)
  })

  it('verdictOf: без разметки верного варианта — мягкая подпись', () => {
    expect(verdictOf(null, card)).toBeNull()
    expect(verdictOf({ ok: false }, { nodes: [say] }).text).toBe('Не то — ничего страшного')
  })
})
