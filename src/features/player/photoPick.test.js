import { describe, it, expect, vi } from 'vitest'
import { pickPhoto } from './photoPick.js'

// Ответ «выбери фото» (вынесен из LessonPlayer.jsx): счётчик ошибок, анализ,
// состояние панели, XP и переход графа с id конкретного фото
const node = {
  id: 'pc', type: 'photo_choice',
  typeData: { photo_choice: { statLessonId: 'L1', photos: [{ id: 'ph0' }, { id: 'ph1' }] } },
}

function ctx(xp = 10) {
  let states = {}
  return {
    nodes: [node], wrongRef: { current: 0 }, record: vi.fn(),
    setPhotoChoiceStates: fn => { states = fn(states) }, getStates: () => states,
    xpMap: new Map([['pc', xp]]), handleXpEarned: vi.fn(), onNodeDone: vi.fn(),
  }
}

describe('ответ «выбери фото»', () => {
  it('верное фото: XP, состояние панели, переход photo_correct с id фото', () => {
    const c = ctx()
    pickPhoto(c, 'pc', 0, true)
    expect(c.wrongRef.current).toBe(0)
    expect(c.record).toHaveBeenCalledWith({ nodeId: 'pc', lessonId: 'L1', type: 'correct', option: 'фото #1' })
    expect(c.getStates()).toEqual({ pc: { selected: 0, result: 'correct' } })
    expect(c.handleXpEarned).toHaveBeenCalledWith(10, 'pc')
    expect(c.onNodeDone).toHaveBeenCalledWith('pc', 'photo_correct', 'ph0')
  })

  it('неверное: +1 ошибка, без XP, photo_wrong', () => {
    const c = ctx()
    pickPhoto(c, 'pc', 1, false)
    expect(c.wrongRef.current).toBe(1)
    expect(c.handleXpEarned).not.toHaveBeenCalled()
    expect(c.onNodeDone).toHaveBeenCalledWith('pc', 'photo_wrong', 'ph1')
  })

  it('XP за ноду нет — начисления нет', () => {
    const c = ctx(0)
    pickPhoto(c, 'pc', 0, true)
    expect(c.handleXpEarned).not.toHaveBeenCalled()
  })
})
