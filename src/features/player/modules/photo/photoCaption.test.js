import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { applyTypeChange } from '../../../canvas/nodeDefaults.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Подмена localStorage: applyTypeChange запоминает последний выбранный тип
const withStore = fn => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  }
  return fn()
}

describe('подпись у фото — в том же пузыре, как у стикера', () => {
  it('плеер рисует подпись внутри пузыря фото', () => {
    const mod = read('./PhotoModule.jsx')
    expect(mod).toContain("node.typeData?.photo?.caption")
    expect(mod).toContain('className="playerPhotoCaption"')
    // раскраска слов работает так же, как у стикера
    expect(mod).toContain('<HighlightedText')
    expect(mod).toContain("highlights={node.typeData?.photo?.highlights ?? []}")
  })

  it('подпись рисуется как есть — пробелы не режем, иначе съедут выделения', () => {
    const mod = read('./PhotoModule.jsx')
    expect(mod).toContain('<HighlightedText text={captionRaw}')
    expect(mod).toContain('const caption    = captionRaw.trim()')
  })

  it('длинная подпись не растягивает пузырь шире фотографии', () => {
    const css = read('../../../../styles/player/modules/photo.css')
    // ширина кадра — одним числом на пузырь и подпись
    expect(css).toContain('--photo-w: min(50vw, 200px)')
    expect(css).toContain('width: var(--photo-w)')
    expect(css).toContain('max-width: calc(var(--photo-w) + 4px)')
    const caption = css.slice(css.indexOf('.playerPhotoCaption {'))
    expect(caption).toContain('max-width: var(--photo-w)')
    expect(caption).toContain('word-break: break-word')
  })

  it('редактор даёт фото поле подписи, кисть и переносы', () => {
    const editor = read('../../../canvas/NodeContentEditor.jsx')
    // своё поле подписи
    expect(editor).toContain("{(node.type === 'sticker' || node.type === 'photo') && (")
    // тот же текст правят кисть, переносы и смайлики (NodeTextTools)
    expect(editor).toContain("(node.type === 'sticker' || node.type === 'photo') ? (tData.caption ?? '')")
    expect(editor).toContain("(node.type === 'sticker' || node.type === 'photo') ? 'caption'")
    expect(editor).toContain("'sticker', 'photo'")
  })

  it('текст переезжает между фото, стикером и текстовой нодой', () => withStore(() => {
    const photo = {
      id: 'n1', seq: 1, type: 'photo',
      typeData: { photo: { caption: 'Это кот', highlights: [{ start: 0, end: 3 }] } },
      triggers: [{ id: 't', if: 'timer', ms: 2000, then: null }],
    }
    const toText = applyTypeChange(photo, 'text')
    expect(toText.typeData.text.content).toBe('Это кот')
    expect(toText.typeData.text.highlights).toHaveLength(1)

    const sticker = { ...photo, type: 'sticker', typeData: { sticker: { caption: 'Привет' } } }
    expect(applyTypeChange(sticker, 'photo').typeData.photo.caption).toBe('Привет')
  }))

  it('уже написанный текст нового типа не затирается', () => withStore(() => {
    const photo = {
      id: 'n1', seq: 1, type: 'photo',
      typeData: { photo: { caption: 'Подпись' }, text: { content: 'Уже было' } },
      triggers: [],
    }
    expect(applyTypeChange(photo, 'text').typeData?.text?.content ?? 'Уже было').toBe('Уже было')
  }))
})
