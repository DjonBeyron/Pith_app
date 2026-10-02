import { describe, it, expect } from 'vitest'
import { ARM_AT_VIDEO, MAX_IGNORED, shouldArm, swipeAway } from './slowmoHintPlan.js'

describe('подсказка «замедлить»: когда появляется', () => {
  it('на 3-м видео при первом посещении, раньше — нет', () => {
    expect(ARM_AT_VIDEO).toBe(3)
    expect([1, 2, 3, 4].map(viewed => shouldArm({ viewed, seen: false }))).toEqual([false, false, true, true])
  })

  it('уже воспользовался или убрана — не появляется', () => {
    expect(shouldArm({ viewed: 5, seen: true })).toBe(false)
  })
})

describe('подсказка «замедлить»: три игнора — и её нет', () => {
  it('каждое видео без пользования считается; на третьем — убрать', () => {
    let ignored = 0
    const log = []
    for (let i = 0; i < MAX_IGNORED; i++) {
      const r = swipeAway(ignored)
      ignored = r.ignored
      log.push(r)
    }
    expect(log).toEqual([
      { ignored: 1, retire: false },
      { ignored: 2, retire: false },
      { ignored: 3, retire: true },
    ])
  })

  it('мусор в счётчике — как ноль', () => {
    expect(swipeAway(undefined)).toEqual({ ignored: 1, retire: false })
    expect(swipeAway('x')).toEqual({ ignored: 1, retire: false })
  })

  it('счётчик из прошлых посещений продолжается', () => {
    expect(swipeAway(2)).toEqual({ ignored: 3, retire: true })
  })
})
