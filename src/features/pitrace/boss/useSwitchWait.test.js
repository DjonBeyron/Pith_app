import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { switchWait, SWITCH_WAIT_LINE, SWITCH_GRACE_MS, SWITCH_WAIT_CAP_MS } from './useSwitchWait.js'
import { MIA_LINE_IDS, miaLine } from '../mia/miaLines.js'
import { READY_MS } from '../raceSwitch.js'

// Ожидание смены слуха в «Мия меняет правила»: ждём событие «модель готова», а не таймер; прикрытие — одна реплика, только если модель не успела за SWITCH_GRACE_MS.
const rig = (state = 'switching') => {
  const r = { state, queue: 0, said: [], went: 0 }
  r.sw = { state: () => r.state }
  r.mspeech = { enqueue: cues => { for (const c of cues) { r.said.push(c.id); r.queue += 1 } }, pending: () => r.queue }
  r.afterCount = fn => { r.went += 1; fn?.() }
  return r
}
beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('ожидание смены слуха (boss-sw)', () => {
  it('реплика-прикрытие есть в каталоге Мии, текст без запрещённых знаков, говорит Мия', () => {
    expect(MIA_LINE_IDS).toContain(SWITCH_WAIT_LINE)
    expect(miaLine(SWITCH_WAIT_LINE)).toMatchObject({ who: 'mia' }); expect(miaLine(SWITCH_WAIT_LINE).text).not.toMatch(/[.…!—–]/)
  })
  it('модель уже готова (быстрое устройство): стадия кончается сразу, реплики нет', () => {
    const r = rig('ru'); switchWait({ ...r, fn: () => {} })
    expect(r.went).toBe(1); expect(r.said).toEqual([])
  })
  it('слух не вышел (состояние en): ждать нечего, реплики нет', () => {
    const r = rig('en'); switchWait({ ...r, fn: () => {} })
    expect(r.went).toBe(1); expect(r.said).toEqual([])
  })
  it('модель успела за паузу ожидания: реплики нет, переход один', () => {
    const r = rig(); switchWait({ ...r, fn: () => {} })
    vi.advanceTimersByTime(SWITCH_GRACE_MS - 100); r.state = 'ru'; vi.advanceTimersByTime(300)
    expect(r.said).toEqual([]); expect(r.went).toBe(1)
  })
  it('модель грузится долго: одна реплика-прикрытие, переход — только когда модель готова И реплика договорена; события, а не таймер', () => {
    const r = rig(); switchWait({ ...r, fn: () => {} })
    vi.advanceTimersByTime(SWITCH_GRACE_MS + 50)
    expect(r.said).toEqual([SWITCH_WAIT_LINE]); expect(r.went).toBe(0)
    vi.advanceTimersByTime(8000); expect(r.went).toBe(0) // модель всё ещё грузится: ждём сколько нужно (не по таймеру)
    r.state = 'ru'; vi.advanceTimersByTime(500); expect(r.went).toBe(0) // реплика ещё звучит: слова не накладываются на неё
    r.queue = 0; vi.advanceTimersByTime(300)
    expect(r.went).toBe(1); expect(r.said).toEqual([SWITCH_WAIT_LINE])
  })
  it('модель не включилась (en после попытки): после реплики идём дальше — блок уже переведён на английскую', () => {
    const r = rig(); switchWait({ ...r, fn: () => {} })
    vi.advanceTimersByTime(SWITCH_GRACE_MS + 50); r.state = 'en'; r.queue = 0; vi.advanceTimersByTime(300)
    expect(r.went).toBe(1)
  })
  it('пауза, смена стадии (cancel): переход не происходит и реплики больше не ставятся', () => {
    const r = rig(); const cancel = switchWait({ ...r, fn: () => {} })
    cancel(); vi.advanceTimersByTime(SWITCH_GRACE_MS + 500)
    expect(r.said).toEqual([]); expect(r.went).toBe(0)
    const r2 = rig(); const c2 = switchWait({ ...r2, fn: () => {} })
    vi.advanceTimersByTime(SWITCH_GRACE_MS + 50); c2(); r2.state = 'ru'; r2.queue = 0; vi.advanceTimersByTime(1000)
    expect(r2.went).toBe(0)
  })
  it('страховка: ожидание не дольше срока русской модели с запасом', () => {
    expect(SWITCH_WAIT_CAP_MS).toBeGreaterThan(READY_MS)
    const r = rig(); switchWait({ ...r, fn: () => {} })
    vi.advanceTimersByTime(SWITCH_WAIT_CAP_MS + SWITCH_GRACE_MS + 500)
    expect(r.went).toBe(1) // модель так и не ответила — стадия не висит вечно
  })
})
