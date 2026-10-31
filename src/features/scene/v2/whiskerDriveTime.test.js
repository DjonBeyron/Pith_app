import { describe, it, expect } from 'vitest'
import { ease, MAX_STEP } from './whiskerDrive.js'
import { WHISKER_MODES, forgetAnchors } from './whiskerWrite.js'
import { rig, clean, maxStep, fakeRoot } from './whiskerTestRig.js'

// Привод усов: время и шаг угла (Safari: 30 fps, пропуски кадров), смена способа записи на ходу (HUD)
describe('createWhiskerDrive: время и шаг угла (Safari: 30 fps, пропуски кадров)', () => {
  it('амплитуда — по реальному времени: при 30 fps (33 мс) рампа кончается за те же ~300 мс, а не за 300 мс кадров', () => {
    const r = rig()
    r.drive.set(true)
    for (let i = 0; i < 10; i++) r.tick(33.3) // 333 мс
    expect(r.drive.state().amp).toBe(1)
    const long = rig()
    long.drive.set(true)
    long.tick(150) // кадр в 150 мс (фон, троттлинг): рампа прошла половину по часам, а не 64 мс
    expect(long.drive.state().amp).toBeCloseTo(ease(0.5), 5)
  })

  it('метка кадра rAF берётся, если сходится с часами; разошлась (старый WebView) — часы now()', () => {
    const a = rig()
    a.drive.set(true)
    a.tick(100, a.time() + 150) // часы показывают +100 мс, метка кадра +150: берётся метка, k = 150/300
    expect(a.drive.state().amp).toBeCloseTo(ease(0.5), 5)
    const b = rig()
    b.drive.set(true)
    b.tick(150, 9e9) // метка из другой эпохи — игнорируем
    expect(b.drive.state().amp).toBeCloseTo(ease(0.5), 5)
  })

  it('шаг угла за кадр ≤ MAX_STEP (1,2°): после пропуска кадров усы не прыгают, а догоняют; на покое они возвращаются в 0 тем же ходом', () => {
    for (const mode of WHISKER_MODES) {
      forgetAnchors()
      const r = rig({ mode })
      r.drive.set(true)
      r.tick(1000) // первый кадр после секундной паузы: амплитуда уже 1, волна на пике
      for (let i = 0; i < 6; i++) r.tick(500)
      for (const w of r.root.whs) { expect(Math.abs(w.frames[0])).toBeLessThanOrEqual(MAX_STEP + 0.011); expect(maxStep(w)).toBeLessThanOrEqual(MAX_STEP + 0.011) }
      r.drive.set(false)
      for (let i = 0; i < 12 && r.running(); i++) r.tick(500)
      expect(r.running()).toBe(false)
      for (const w of r.root.whs) { expect(clean(w)).toBe(true); expect(maxStep(w)).toBeLessThanOrEqual(MAX_STEP + 0.011) }
    }
  })

  it('кадр после долгой паузы вкладки не перепрыгивает фазу: фаза за кадр не больше 64 мс', () => {
    const r = rig()
    r.drive.set(true)
    r.tick(5000)
    expect(r.drive.state().ph).toBeLessThanOrEqual(64)
  })
})

describe('createWhiskerDrive: смена способа записи на ходу (HUD)', () => {
  it('rotate → transform → attr → rotate: прежняя запись снимается, новая пишется в том же кадре, угол непрерывен', () => {
    forgetAnchors()
    const r = rig({ mode: 'rotate' })
    r.drive.set(true)
    for (let i = 0; i < 30; i++) r.tick()
    const w = r.root.whs[0]
    expect(w.style.rotate).not.toBe('')
    for (const next of ['transform', 'attr', 'rotate']) {
      r.o.mode = next
      r.tick()
      expect(r.drive.state().mode).toBe(next)
      expect(!!w.style.rotate).toBe(next === 'rotate')
      expect(!!w.style.transform).toBe(next === 'transform')
      expect(!!w.attrs.transform).toBe(next === 'attr')
      expect(!!w.style.transformOrigin).toBe(next === 'attr')
    }
    expect(maxStep(w, 30)).toBeLessThan(0.7) // ни одного провала в 0 между способами
    r.drive.set(false)
    for (let i = 0; i < 40 && r.running(); i++) r.tick()
    expect(r.root.whs.every(clean)).toBe(true)
  })
})

describe('createWhiskerDrive: владение усами', () => {
  it('два привода на одних усах: новый забирает усы у прежнего (прежний снят, двойного качания нет)', () => {
    const root = fakeRoot()
    const a = rig({ root }), b = rig({ root })
    a.drive.set(true)
    for (let i = 0; i < 20; i++) a.tick()
    b.drive.set(true)
    expect(a.running()).toBe(false)
    expect(a.drive.state().amp).toBe(0)
    for (let i = 0; i < 5; i++) b.tick()
    expect(b.running()).toBe(true)
  })
})
