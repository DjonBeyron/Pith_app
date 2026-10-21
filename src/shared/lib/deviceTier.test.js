import { describe, it, expect } from 'vitest'
import { decideWeak, applyWeakDeviceClasses, markWeakDevice, isWeakDevice } from './deviceTier.js'

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

  // Целевое «минимальное» устройство — Samsung Galaxy A50 (Exynos 9610, Mali-G72 MP3): оно слабое по GPU
  it('A50: Mali-G72 в любой записи Chrome/Samsung Internet → слабое (gpu)', () => {
    for (const gpu of ['Mali-G72', 'ARM Mali-G72 MP3', 'Mali-G72MP3', 'ANGLE (ARM, Mali-G72, OpenGL ES 3.2 v1.r26p0)']) {
      expect(decideWeak({ ios: false, gpu, staticWeak: fast, benchSlow: fast })).toBe('gpu')
    }
  })

  it('J-серия (Mali-T830/T880) и Mali-G71 → слабое; новые Mali-G720/G78 — нет', () => {
    for (const gpu of ['Mali-T830', 'Mali-T880', 'Mali-G71', 'PowerVR Rogue GE8320']) {
      expect(decideWeak({ ios: false, gpu, staticWeak: fast, benchSlow: fast })).toBe('gpu')
    }
    for (const gpu of ['Mali-G720', 'Mali-G78', 'Mali-G710']) {
      expect(decideWeak({ ios: false, gpu, staticWeak: fast, benchSlow: fast })).toBe(null)
    }
  })
})

describe('deviceTier.applyWeakDeviceClasses', () => {
  it('слабое устройство → .weak-device и perf-no-textures на <html>; не слабое — классов нет', () => {
    const added = new Set()
    globalThis.document = { documentElement: { classList: { add: (...c) => c.forEach(x => added.add(x)) } } }
    try {
      applyWeakDeviceClasses()
      const wasWeak = isWeakDevice()
      expect(added.has('weak-device')).toBe(wasWeak)
      expect(added.has('perf-no-textures')).toBe(wasWeak)
      if (!wasWeak) {
        // FPS-монитор позже помечает слабым — классы ставятся сразу (Android UA в тесте нет)
        markWeakDevice()
        expect(added.has('weak-device')).toBe(true)
      }
    } finally { delete globalThis.document }
  })
})
