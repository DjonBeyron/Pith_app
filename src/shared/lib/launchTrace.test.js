import { describe, it, expect, beforeEach } from 'vitest'
import { traceLaunch, getLaunchTrace, resetLaunchTrace, stateSignature } from './launchTrace.js'

describe('трассировка карточки запуска', () => {
  beforeEach(resetLaunchTrace)
  it('события копятся с временем, буфер кольцевой', () => {
    traceLaunch('a'); traceLaunch('b')
    const t = getLaunchTrace()
    expect(t.map(x => x.msg)).toEqual(['a', 'b'])
    expect(t[1].t).toBeGreaterThanOrEqual(t[0].t)
    for (let i = 0; i < 400; i++) traceLaunch(`m${i}`)
    expect(getLaunchTrace().length).toBe(300)
    expect(getLaunchTrace().at(-1).msg).toBe('m399')
  })
  it('подпись состояния одинаковая для одинакового состояния и другая при переходе', () => {
    const s = { canStart: false, notWarm: ['scene#1'] }
    expect(stateSignature(s)).toBe(stateSignature({ ...s }))
    expect(stateSignature(s)).not.toBe(stateSignature({ ...s, canStart: true }))
  })
})
