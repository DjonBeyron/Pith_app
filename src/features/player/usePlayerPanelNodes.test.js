import { describe, it, expect } from 'vitest'
import { pickPanelNodes } from './usePlayerPanelNodes.js'

const n = (id, type) => ({ id, type, seq: Number(id) })

describe('какая нода сейчас в нижней панели', () => {
  it('панель показывается, пока её нода последняя в ленте', () => {
    const p = pickPanelNodes([n('1', 'audio'), n('2', 'word_choice')])
    expect(p.wc?.id).toBe('2')
  })

  it('пришло следующее сообщение — панель уходит вместе со своей нодой', () => {
    // ровно тот баг: шаг «вперёд» отвечает в обход панели, и она висела
    // поверх новых сообщений
    const p = pickPanelNodes([n('1', 'audio'), n('2', 'word_choice'), n('3', 'text')])
    expect(p.wc).toBe(null)
  })

  it('шаг назад вернул вопрос — панель снова на месте', () => {
    const after = pickPanelNodes([n('1', 'audio'), n('2', 'word_choice')])
    expect(after.wc?.id).toBe('2')
  })

  it('каждый тип панели работает одинаково', () => {
    for (const [kind, type] of [['pa', 'phrase_assembly'], ['pc', 'photo_choice'],
      ['reg', 'registration'], ['table', 'table']]) {
      expect(pickPanelNodes([n('1', type)])[kind]?.id).toBe('1')
      expect(pickPanelNodes([n('1', type), n('2', 'text')])[kind]).toBe(null)
    }
  })

  it('две ноды одного типа подряд — панель у свежей', () => {
    const p = pickPanelNodes([n('1', 'word_choice'), n('2', 'word_choice')])
    expect(p.wc?.id).toBe('2')
  })

  it('закреп висит, даже когда лента ушла дальше', () => {
    const p = pickPanelNodes([n('1', 'pin_message'), n('2', 'audio'), n('3', 'text')])
    expect(p.pin?.id).toBe('1')
  })

  it('пустая лента ничего не открывает', () => {
    const p = pickPanelNodes([])
    expect(p.wc).toBe(null)
    expect(p.pin).toBe(null)
  })
})
