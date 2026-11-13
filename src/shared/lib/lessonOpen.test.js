import { describe, it, expect, beforeEach, vi } from 'vitest'
import { shutAllMics as shutGameMic } from './gameMicLeave.js'
import { _resetLessonOpen, isLessonOpen, lessonClosed, lessonOpened, onLessonOpenChange } from './lessonOpen.js'

vi.mock('./gameMicLeave.js', () => ({ shutAllMics: vi.fn() }))

beforeEach(() => {
  shutGameMic.mockClear()
  vi.useFakeTimers()
  _resetLessonOpen()
})

describe('lessonOpen: микрофон при выходе из урока (v3.3.212)', () => {
  it('урок закрыт совсем — микрофон игры останавливается по-настоящему (жёлтая точка в ленте гаснет); между карточками повторения — не трогаем', () => {
    lessonOpened(); lessonClosed(); vi.advanceTimersByTime(100); lessonOpened() // следующая карточка внутри задержки
    vi.advanceTimersByTime(400)
    expect(shutGameMic).not.toHaveBeenCalled()
    lessonClosed(); vi.advanceTimersByTime(400)
    expect(shutGameMic).toHaveBeenCalledTimes(1); expect(shutGameMic).toHaveBeenCalledWith('урок закрыт')
  })
})

describe('lessonOpen', () => {
  it('открытие поднимает флаг сразу, закрытие снимает с задержкой', () => {
    const seen = []
    onLessonOpenChange(v => seen.push(v))
    lessonOpened()
    expect(isLessonOpen()).toBe(true)
    lessonClosed()
    expect(isLessonOpen()).toBe(true) // ещё держим
    vi.advanceTimersByTime(400)
    expect(isLessonOpen()).toBe(false)
    expect(seen).toEqual([true, false])
  })

  it('два плеера разом (слой lesson_ref): флаг держится, пока жив хоть один', () => {
    lessonOpened()
    lessonOpened()
    lessonClosed()
    vi.advanceTimersByTime(400)
    expect(isLessonOpen()).toBe(true)
    lessonClosed()
    vi.advanceTimersByTime(400)
    expect(isLessonOpen()).toBe(false)
  })

  it('смена карточек повторения внутри задержки — без «пробуждения» фона', () => {
    const seen = []
    onLessonOpenChange(v => seen.push(v))
    lessonOpened()
    lessonClosed()
    vi.advanceTimersByTime(100)
    lessonOpened() // следующая карточка
    vi.advanceTimersByTime(400)
    expect(isLessonOpen()).toBe(true)
    expect(seen).toEqual([true])
  })
})
