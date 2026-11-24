import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { bossLeadMs, createLeadTimer } from './bossLead.js'
import { halfTravelMs } from '../../player/modules/rotate-phone/wordLaneConveyorSpeed.js'
import { BOSS } from '../mia/raceMia.js'

// v3.3.271: финал — слово Пита после выезда пилюли; Мия после «не успел» говорит после ответа Пита; ушедшая по трём верным Мия не оставляет слово «между диалогами» (владелец, логи v3.3.270)
const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('финал: пилюля выезжает до слова Пита', () => {
  it('слово ждёт путь пилюли до 50 % (halfTravelMs) только в финале; в остальных ступенях — 0', () => {
    expect(bossLeadMs('boss', 0.5)).toBe(Math.round(halfTravelMs(0.5))); expect(bossLeadMs('boss', 0.5)).toBeGreaterThan(800)
    for (const act of ['sprint', 'catch', 'climb', 'phrases']) expect(bossLeadMs(act, 0.5)).toBe(0)
  })
  it('таймер: fn — через ms, cancel снимает, 0 — сразу', () => {
    const fn = vi.fn(); const timers = []; const t = createLeadTimer({ setTimer: (f, ms) => { timers.push({ f, ms }); return timers.length }, clearTimer: i => { timers[i - 1].f = null } })
    t.run(0, fn); expect(fn).toHaveBeenCalledTimes(1)
    t.run(1000, fn); expect(t.pending()).toBe(true); expect(timers.at(-1).ms).toBe(1000); t.cancel(); expect(t.pending()).toBe(false); expect(timers.at(-1).f).toBeNull()
    t.run(500, fn); timers.at(-1).f(); expect(fn).toHaveBeenCalledTimes(2); expect(t.pending()).toBe(false)
  })
  it('проводка: pre() ждёт выезда пилюли, ответ и смена стадии снимают слово', () => {
    const src = rd('../useRaceActs.js')
    expect(src).toContain('lead.run(leadAfter(mb, act, rep?.speed)'); // было bossLeadMs(act, …): после «Следующее слово» слово не ждёт выезда (leadAfter → 0), иначе — прежний bossLeadMs expect(src).toContain('lead.cancel(); tr.last();'); expect(src).toContain('surface.cancel(); lead.cancel()')
  })
})

describe('Мия и Пит', () => {
  it('реплика Мии на «не успел» в финале идёт ПЕРВОЙ, без задержки (владелец 2026-11-22; было — после слова Пита, MISS_AT ≥ 1,5 с)', () => {
    expect(BOSS.MISS_AT).toBeUndefined(); expect(rd('../mia/raceMia.js')).toContain("[line(variantOf('boss_mia_miss', m.hits + 1), 'mia'), ...(told ?")
  })
  it('Мия ушла по трём верным: следующее слово круга не выезжает и не озвучивается до перехода (pitLeft = LOCK_MS)', () => {
    expect(rd('../useRaceActs.js')).toContain('pitLeft: () => (leftByWin ? LOCK_MS :')
  })
  it('верный ответ с шумом в той же реплике не даёт Мии «мимо» (claimedNow в wordLaneStudent)', () => {
    const src = rd('../../player/modules/rotate-phone/wordLaneStudent.js')
    expect(src).toContain('claimedNow = true'); expect(src).toContain('if (newMisses > 0 && !claimedNow)')
  })
})
