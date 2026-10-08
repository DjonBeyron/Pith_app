import { describe, it, expect } from 'vitest'
import { decideWeak } from './deviceTier.js'

const slow = () => true
const fast = () => false

describe('deviceTier.decideWeak', () => {
  it('iOS + медленный бенчмарк → не слабое (GPU «Apple GPU» не в списке)', () => {
    expect(decideWeak({ ios: true, gpu: 'Apple GPU', staticWeak: slow, benchSlow: slow })).toBe(null)
  })

  it('Android: слабый GPU из списка → gpu, независимо от бенчмарка', () => {
    expect(decideWeak({ ios: false, gpu: 'Mali-G72', staticWeak: fast, benchSlow: fast })).toBe('gpu')
  })

  it('Android: GPU не в списке, но мало ядер/памяти → static; медленный бенчмарк → bench', () => {
    expect(decideWeak({ ios: false, gpu: 'Adreno (TM) 730', staticWeak: slow, benchSlow: fast })).toBe('static')
    expect(decideWeak({ ios: false, gpu: 'Adreno (TM) 730', staticWeak: fast, benchSlow: slow })).toBe('bench')
    expect(decideWeak({ ios: false, gpu: 'Adreno (TM) 730', staticWeak: fast, benchSlow: fast })).toBe(null)
  })
})
