import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { lootState, lootKey, lootScore, lootTalk, lootReset } from './bossLootFlow.js'
import { LOOT_TOTAL_MS, LOOT_WAIT_MS, LOOT_UP_PX } from './bossLoot.js'
import { XP_PULSE_MS } from '../../player/modules/rotate-phone/WordLaneXpFlight.js'
import { bossXp, peekBossZone, setBossZoneNow, setBossWonZone, setBossZoneIdle } from './bossZoneNow.js'
import { examWordLine } from './examLog.js'
import { examRound, examBlock } from './bossMia.js'

// Владелец 2026-11-26: (1) трофеи Мии — в стиле игрока: пилюля над её головой в момент, когда она про это говорит, летит к счётчику, число меняется по прилёту;
// (2) «в красной зоне всё равно начисляется»: зона счётчика в углу — та же, что ушла в счёт экзамена; в журнале строка на каждое слово.
const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height })
function stage({ head = rect(40, 620, 60, 50), hidden = false } = {}) {
  const log = { fly: [], pulse: [] }
  const heads = [{ style: { display: 'none' }, getBoundingClientRect: () => rect(0, 0, 0, 0) }, { style: { display: hidden ? 'none' : '' }, getBoundingClientRect: () => head }]
  const fly = { textContent: '', offsetWidth: 80, offsetHeight: 30, animate(frames, opts) { const a = { frames, opts, text: fly.textContent, cancelled: false, cancel() { a.cancelled = true }, onfinish: null }; log.fly.push(a); return a } }
  const els = { root: { getBoundingClientRect: () => rect(0, 0, 375, 812), parentElement: { querySelectorAll: () => heads } }, chip: { animate: (f, o) => log.pulse.push(o) }, num: { textContent: '', getBoundingClientRect: () => rect(50, 84, 14, 14) }, fly }
  const s = lootState(); s.els = els
  return { s, log, num: els.num }
}
const miss = key => lootKey({ id: 'boss_mia_miss_3', key })

describe('трофеи Мии: пилюля над её головой с началом колкости, число — когда долетела', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('слово потеряно: число не меняется, пока Мия не начала колкость; с её началом — пилюля «+20 XP» над головой; долетела — число и «вдох» счётчика', () => {
    const { s, log, num } = stage()
    lootScore(s, { show: true, lost: 0, dug: 0, missKey: null }); expect(log.fly).toHaveLength(0) // первый показ — без анимации
    lootScore(s, { show: true, lost: 20, dug: 1, missKey: null })
    expect(num.textContent).toBe('0'); expect(log.fly).toHaveLength(0) // Мия ещё молчит (очередь речи занята) — трофеи ждут
    lootTalk(s, lootKey({ id: 'boss_pit_next', key: 7 })); expect(log.fly).toHaveLength(0) // чужая реплика пилюлю не выпускает
    lootTalk(s, miss(8))
    expect(log.fly).toHaveLength(1); const a = log.fly[0]
    expect(a.text).toBe('+20 XP'); expect(a.opts).toEqual({ duration: LOOT_TOTAL_MS, easing: 'linear' })
    expect(a.frames[0].transform).toContain(`translate(70.0px, ${(620 - LOOT_UP_PX).toFixed(1)}px)`) // над макушкой: центр головы по x, выше её верха
    expect(a.frames.at(-1).transform).toContain('translate(57.0px, 91.0px)') // центр числа Мии
    expect(num.textContent).toBe('0'); expect(log.pulse).toHaveLength(0) // летит — число прежнее
    a.onfinish()
    expect(num.textContent).toBe('20'); expect(log.pulse).toEqual([{ duration: XP_PULSE_MS, easing: 'linear' }]); expect(s.air).toBe(null); expect(s.timer).toBe(0)
    lootTalk(s, miss(8)); expect(log.fly).toHaveLength(1) // та же колкость второй раз пилюлю не выпускает
  })
  it('колкость началась в том же обновлении, что и счёт, — пилюля сразу; прежняя колкость (её номер уже отыгран) за новую не сходит', () => {
    const { s, log } = stage()
    lootScore(s, { show: true, lost: 0, dug: 0, missKey: null })
    lootScore(s, { show: true, lost: 20, dug: 1, missKey: miss(3) }); expect(log.fly).toHaveLength(1)
    lootTalk(s, miss(3)); expect(log.fly).toHaveLength(1)
    log.fly[0].onfinish()
    lootScore(s, { show: true, lost: 40, dug: 2, missKey: miss(3) }); expect(log.fly).toHaveLength(1) // talk ещё держит прошлую колкость — ждём новую
    lootTalk(s, miss(4)); expect(log.fly).toHaveLength(2); expect(log.fly[1].text).toBe('+20 XP')
  })
  it('верный ответ в жёлтой / красной зоне (реплики про трофеи нет) — пилюля сразу; вторая потеря во время полёта: первая уже на счётчике', () => {
    const { s, log, num } = stage()
    lootScore(s, { show: true, lost: 0, dug: 0, missKey: null })
    lootScore(s, { show: true, lost: 17, dug: 0, missKey: null }); expect(log.fly).toHaveLength(1); expect(log.fly[0].text).toBe('+17 XP'); expect(num.textContent).toBe('0')
    lootScore(s, { show: true, lost: 27, dug: 0, missKey: null })
    expect(log.fly[0].cancelled).toBe(true); expect(log.fly).toHaveLength(2); expect(log.fly[1].text).toBe('+10 XP'); expect(num.textContent).toBe('17')
    log.fly[0].onfinish?.(); expect(num.textContent).toBe('17') // конец снятой анимации число не трогает
    log.fly[1].onfinish(); expect(num.textContent).toBe('27')
  })
  it('колкость не началась (пауза, очередь речи сброшена) — число обновится само; головы Мии нет / «меньше движения» — без пилюли, число и «вдох»', () => {
    const a = stage(); lootScore(a.s, { show: true, lost: 0, dug: 0, missKey: null }); lootScore(a.s, { show: true, lost: 20, dug: 1, missKey: null })
    vi.advanceTimersByTime(LOOT_WAIT_MS - 1); expect(a.log.fly).toHaveLength(0); vi.advanceTimersByTime(2); expect(a.log.fly).toHaveLength(1)
    const b = stage({ hidden: true }); lootScore(b.s, { show: true, lost: 0, dug: 0, missKey: null }); lootScore(b.s, { show: true, lost: 10, dug: 0, missKey: null })
    expect(b.log.fly).toHaveLength(0); expect(b.num.textContent).toBe('10'); expect(b.log.pulse).toHaveLength(1)
    const c = stage(); c.s.still = true; lootScore(c.s, { show: true, lost: 0, dug: 0, missKey: null }); lootScore(c.s, { show: true, lost: 20, dug: 1, missKey: miss(1) })
    expect(c.log.fly).toHaveLength(0); expect(c.num.textContent).toBe('20')
  })
  it('счётчик скрыт / счёт сброшен / компонент снят — пилюля и таймер сняты, число равно счёту', () => {
    const { s, log, num } = stage()
    lootScore(s, { show: true, lost: 0, dug: 0, missKey: null }); lootScore(s, { show: true, lost: 20, dug: 1, missKey: null }); expect(s.timer).not.toBe(0)
    lootScore(s, { show: false, lost: 20, dug: 1, missKey: null }); expect(s.timer).toBe(0); expect(num.textContent).toBe('20')
    lootScore(s, { show: true, lost: 20, dug: 1, missKey: null }); lootScore(s, { show: true, lost: 30, dug: 1, missKey: null }); expect(log.fly).toHaveLength(1)
    lootReset(s); expect(log.fly[0].cancelled).toBe(true); expect(s.air).toBe(null); expect(num.textContent).toBe('30')
    vi.advanceTimersByTime(LOOT_WAIT_MS * 2); expect(log.fly).toHaveLength(1)
  })
})

describe('красная зона: счётчик в углу получает ровно то, что ушло в счёт экзамена', () => {
  it('зона принятого слова не сбрасывается на зелёную, пока начисление ждёт взлёта пилюли (следующая пилюля уже над экраном)', () => {
    setBossZoneNow('slow'); setBossWonZone('slow'); setBossZoneIdle() // кадр зачёта, затем кадр «следующая пилюля ещё не коснулась шкалы»
    expect(peekBossZone()).toBe('slow'); expect(bossXp()).toBe(3) // раньше здесь было бы 20: «зона сейчас» уже зелёная
    expect(bossXp()).toBe(20) // зона принятого слова отдана один раз: следующее слово, принятое до касания шкалы, — зелёное
    setBossZoneNow('mid'); expect(bossXp()).toBe(10) // кадра зачёта ещё не было — зона линии последнего кадра
    setBossWonZone('slow'); setBossZoneNow('fast'); expect(bossXp()).toBe(20) // новое слово в работе — зона прошлого слова забыта
  })
})

describe('журнал экзамена: одна строка на слово', () => {
  const st = { silent: true, offset: 0, words: [{ text: 'learn', translation: 'учиться' }, { text: 'remember', translation: 'помнить' }, { text: 'forget', translation: 'забыть' }], step: { lang: 'en' } }
  const start = () => ({ act: 'boss', phase: 'in', streak: 0, wins: 0, hits: 0, seq: 0, ...examBlock({}, st) })
  const run = (m, ev) => { const e = { ...ev, stage: st }, r = examRound(m, e); return { m: r.mia, line: examWordLine(m, r.mia, e, ev.corner) } }
  it('верное слово: зона, сколько игроку и Мии, счёт; строка одна при любом порядке событий «зона» и «верно»', () => {
    let x = run(start(), { t: 'zone', idx: 0, zone: 'slow' }); expect(x.line).toBe(null)
    x = run(x.m, { t: 'win', idx: 0, corner: 3 }); expect(x.line).toBe('[exam] слово 1 «learn»: зона красная, игроку +3, Мии +17; счёт 3 / 17')
    let y = run(x.m, { t: 'win', idx: 1 }); expect(y.line).toBe(null)
    y = run(y.m, { t: 'zone', idx: 1, zone: 'mid' }); expect(y.line).toBe('[exam] слово 2 «remember»: зона жёлтая, игроку +10, Мии +10; счёт 13 / 27')
  })
  it('потерянное слово — причина и +20 Мии, один раз; расхождение со счётчиком в углу видно в строке', () => {
    let x = run(start(), { t: 'fail', idx: 0, spoke: false }); expect(x.line).toBe('[exam] слово 1 «learn»: не названо (молчали), игроку +0, Мии +20; счёт 0 / 20')
    x = run(x.m, { t: 'fail', idx: 0, spoke: false }); expect(x.line).toBe(null)
    x = run(x.m, { t: 'miss', idx: 1 }); expect(x.line).toBe(null)
    x = run(x.m, { t: 'fail', idx: 1 }); expect(x.line).toContain('слово 2 «remember»: не названо (сказано чужое слово)')
    let y = run(x.m, { t: 'zone', idx: 2, zone: 'slow' }); y = run(y.m, { t: 'win', idx: 2, corner: 20 })
    expect(y.line).toBe('[exam] слово 3 «forget»: зона красная, игроку +3, Мии +17 (РАСХОЖДЕНИЕ: счётчик в углу получает +20); счёт 3 / 57')
  })
})
