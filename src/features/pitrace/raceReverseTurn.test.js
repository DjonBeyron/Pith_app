// Разворот в реверс (raceReverseTurn.js), уход Мии без наползания реплик (mia/miaLeave.js) и стадия catch-rev (владелец 2026-11-17)
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { miaColorOn } from './mia/miaTint.js'
import { runReverseTurn, revBack, REV_WAIT_POLL_MS, TURN_EVENT, REV_MS, REV_ARRIVE_MS, REV_PAUSE_MS, REV_TURN_MS, REV_LEAVE_MS, REV_BACK_LEAD_MS, REV_HOLD_CAP_MS } from './raceReverseTurn.js'
import { stageTiming } from '../rehearsal/rehearsalCountdown.js'
import { revTurnLatestMs, revTimes } from './raceReverseTimes.js'
import { DECEL_MS } from '../player/modules/rotate-phone/wordLaneConveyor.js'
import { afterLeaveSpeech, LEAVE_MAX_POLLS } from './mia/miaLeave.js'

const rd = p => readFileSync(new URL(p, import.meta.url), 'utf8')

function rig() {
  const timers = []; const calls = []; let next = 0
  const mkEl = () => ({ animations: [], animate(frames, o) { const a = { frames, o, cancel: vi.fn() }; this.animations.push(a); return a } })
  const els = [mkEl(), mkEl(), mkEl()]
  const pool = {
    take: lane => { calls.push(['take', lane]); return next++ }, el: k => els[k], cap: (k, c) => calls.push(['cap', k, c]),
    attr: (k, n, on = true) => calls.push(['attr', k, n, on]), give: k => calls.push(['give', k]),
  }
  const events = []
  const root = { attrs: {}, setAttribute(n, v) { this.attrs[n] = v }, removeAttribute(n) { delete this.attrs[n] }, dispatchEvent(e) { events.push(e.detail) } }
  const setTimer = (fn, ms) => { timers.push({ fn, ms }); return timers.length }
  return { pool, root, els, calls, timers, events, setTimer, run: o => runReverseTurn({ pool, root, log: () => {}, setTimer, clearTimer: () => {}, ...o }) }
}
const T = { still: 0, rotate: 1, flip: 2, leave: 3, end: 4 } // порядок таймеров разворота

describe('разворот в реверс', () => {
  it('три пилюли с тройной стрелкой (data-arrow = down), приезд по направлению конвейера с замедлением до нуля за REV_ARRIVE_MS; конвейер до остановки едет', () => {
    const r = rig(); r.run()
    expect(r.calls.filter(c => c[0] === 'take').map(c => c[1])).toEqual([0, 1, 2])
    expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-arrow').every(c => c[3] === 'down')).toBe(true)
    expect(r.events).toEqual([]) // пока едут — конвейер не гасим
    for (const el of r.els) expect(el.animations[0].o).toMatchObject({ duration: REV_ARRIVE_MS, fill: 'both' })
    expect(r.els[0].animations[0].frames[0].translate).toContain('-14.000dvh')
  })
  it('таймлайн: конвейер тормозит за DECEL_MS до остановки пилюль (data-still), стоит; поворот на 180°; направление узора — в середине поворота; отъезд ВВЕРХ с ускорением, конвейер стартует событием; всё укладывается в REV_MS', () => {
    const r = rig(); r.run()
    expect(r.timers.map(t => t.ms)).toEqual([REV_ARRIVE_MS - DECEL_MS, REV_ARRIVE_MS + REV_PAUSE_MS, REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS / 2, REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS, REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS + REV_LEAVE_MS + 40])
    expect(REV_MS).toBeGreaterThan(r.timers.at(-1).ms - 1)
    r.timers[T.still].fn(); expect(r.events).toEqual(['halt']) // конвейер тормозит и стоит
    r.timers[T.rotate].fn(); expect(r.els.every(e => e.animations[1].frames[1].rotate === '180deg')).toBe(true)
    expect(r.root.attrs['data-up']).toBeUndefined(); r.timers[T.flip].fn(); expect(r.root.attrs['data-up']).toBe('')
    expect(r.events).toEqual(['halt']); r.timers[T.leave].fn(); expect(r.events).toEqual(['halt', 'warm']) // и стартует разгоном
    expect(r.els[0].animations[2].o.duration).toBe(REV_LEAVE_MS); expect(r.els[0].animations[2].frames.at(-1).translate).toContain('-14.000dvh') // уезжают вверх, за тот же край, откуда приехали
    r.timers[T.end].fn(); expect(r.events.at(-1)).toBe('resume'); expect(r.calls.filter(c => c[0] === 'give').map(c => c[1])).toEqual([0, 1, 2]); expect(r.els.every(e => e.animations.every(a => a.cancel.mock.calls.length === 1))).toBe(true) // анимации сняты до возврата в пул
  })
  it('data-up ставится на корень игры .wl (root.closest), а не на поле сцены — иначе CSS .wl[data-up] не сработает и узор идёт в прежнюю сторону', () => {
    const r = rig(); const host = { attrs: {}, setAttribute(n, v) { this.attrs[n] = v }, removeAttribute(n) { delete this.attrs[n] } }
    r.root.closest = sel => (sel === '.wl' ? host : null); r.run(); r.timers[T.flip].fn()
    expect(host.attrs['data-up']).toBe(''); expect(r.root.attrs['data-up']).toBeUndefined()
  })
  it('быстрый режим (слабое устройство / reduced-motion): поворот без вращения (1 мс)', () => {
    const r = rig(); r.run({ fast: true }); r.timers[T.rotate].fn()
    expect(r.els[0].animations[1].o.duration).toBe(1)
  })
})

describe('разворот ждёт переключения слуха (v3.3.385)', () => {
  it('модель уже готова к повороту (iPhone ≈ 2 с): тайминг прежний, ожидания нет', () => {
    const r = rig(); r.run({ hold: () => false }); r.timers[T.still + 0].fn()
    const probe = r.timers[1]; expect(probe.ms).toBe(REV_ARRIVE_MS + REV_PAUSE_MS); const n = r.timers.length; probe.fn()
    expect(r.timers.slice(n).map(t => t.ms)).toEqual([0, REV_TURN_MS / 2, REV_TURN_MS, REV_TURN_MS + REV_LEAVE_MS + 40])
    expect(r.calls.some(c => c[0] === 'attr' && c[2] === 'data-wait')).toBe(false)
  })
  it('модель ещё грузится (Android ≈ 9 с): пилюли стоят в центре (data-wait), поворот и отъезд ждут готовности и идут от неё', () => {
    let busy = true; const r = rig(); r.run({ hold: () => busy }); const n0 = r.timers.length; r.timers[1].fn()
    expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-wait' && c[3] === true).length).toBe(3)
    expect(r.els.every(e => e.animations.length === 1)).toBe(true) // не вращаются и не уезжают
    const poll = () => r.timers.at(-1); expect(poll().ms).toBe(REV_WAIT_POLL_MS)
    poll().fn(); poll().fn(); expect(r.els.every(e => e.animations.length === 1)).toBe(true) // всё ещё ждём
    busy = false; const n = r.timers.length; poll().fn()
    expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-wait' && c[3] === false).length).toBe(3)
    expect(r.timers.slice(n).map(t => t.ms)).toEqual([0, REV_TURN_MS / 2, REV_TURN_MS, REV_TURN_MS + REV_LEAVE_MS + 40]); expect(n0).toBe(2) // до готовности запланированы только торможение и проба стоянки: поворот и отъезд не стоят в очереди
    r.timers[n].fn(); expect(r.els.every(e => e.animations[1].frames[1].rotate === '180deg')).toBe(true)
  })
  it('потолок ожидания: модель так и не готова — через REV_HOLD_CAP_MS разворачиваемся сами', () => {
    const now = vi.spyOn(performance, 'now'); now.mockReturnValue(1000)
    const r = rig(); r.run({ hold: () => true }); r.timers[1].fn(); now.mockReturnValue(1000 + REV_HOLD_CAP_MS + 1)
    const n = r.timers.length; r.timers.at(-1).fn(); expect(r.timers.length).toBe(n + 4); now.mockRestore()
  })
  it('revTurnLatestMs: поворот, отъезд и возврат в пул укладываются в стадию — ожидание модели план не удлиняет', () => {
    const hold = 6500, v = 1.28, T = revTimes(v); expect(revTurnLatestMs(hold, v) + REV_TURN_MS + T.leave + 40).toBeLessThan(hold); expect(revTurnLatestMs(hold, v)).toBeGreaterThan(T.arrive + REV_PAUSE_MS) // стадия с репликой Пита: есть запас сверх приезда (≈ 0,8 с в журнале iPhone)
    expect(revTurnLatestMs(REV_MS, 1)).toBeLessThan(REV_ARRIVE_MS + REV_PAUSE_MS + 1) // стадия без реплики: запаса нет, поворот как раньше
  })
  it('после реплики про разворот нет пустого хвоста: у стадии без плашки minMs = 0 (iPhone v3.3.384: 1,37 с тишины после «переключаюсь на русский»)', () => {
    const base = { lead: 250, busyMs: 2000, lineMs: 3657, pause: 600, hasLine: true, quiet: true }
    const was = stageTiming({ ...base, minMs: 1100 }).holdMs, now = stageTiming({ ...base, minMs: 0 }).holdMs
    expect(was - (250 + 2000 + 20 + 3657)).toBeGreaterThan(1300); expect(now).toBe(250 + 2000 + 3657 + 600); expect(was - now).toBeGreaterThanOrEqual(700)
  })
  it('проводка: слух читает fx.switching из директора, стадия ждёт через useSwitchWait, у пилюли data-wait сбрасывается в пуле, у стадии разворота нет фиксированного хвоста ms', () => {
    expect(rd('./useRaceActs.js')).toContain("switching: () => sw.state() === 'switching'"); expect(rd('./useRaceActs.js')).toContain('rh.holdMs({ ...st, ms: 0 })')
    expect(rd('../player/modules/rotate-phone/useWordLanePills.js')).toContain('hold: back ? null : () => !!fxRef.current?.switching?.()')
    expect(rd('../player/modules/rotate-phone/wordLanePool.js')).toContain("'data-wait'"); expect(rd('./useRaceActs.js')).toContain('revTurnLatestMs(running.revHoldMs')
    expect(rd('../../styles/player/modules/race-reverse.css')).toContain('data-wait')
  })
})

describe('разворот назад (церемония Мии после B)', () => {
  it('пилюли приезжают снизу (data-arrow = up) и уезжают вниз; узор дорожек возвращается вниз (data-up снят); busy снимается при возврате в пул', () => {
    const r = rig(); r.root.attrs['data-up'] = ''; revBack.busy = true; r.run({ back: true })
    expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-arrow').every(c => c[3] === 'up')).toBe(true)
    const f0 = r.els[0].animations[0].frames; expect(f0[0].translate).toContain('114.000dvh'); expect(f0[1].translate).toContain('68.000dvh'); expect(f0[2].translate).toContain('50.000dvh') // снизу (100 − (−14)) в центр: равномерно до точки торможения, потом замедление
    r.timers[T.rotate].fn(); r.timers[T.flip].fn(); expect(r.root.attrs['data-up']).toBeUndefined() // конвейер вниз
    r.timers[T.leave].fn(); expect(r.els[0].animations[2].frames.at(-1).translate).toContain('114.000dvh') // отъезд вниз
    expect(revBack.busy).toBe(false) // три ноты церемонии идут на отъезде пилюль, а не после него (после диалогов Мии не должно быть тишины)
    r.timers[T.end].fn(); expect(revBack.busy).toBe(false)
  })
  it('разворот назад стартует за REV_BACK_LEAD_MS до конца диалогов: к последним словам Мии пилюли уже развернулись', () => {
    expect(REV_BACK_LEAD_MS).toBe(REV_ARRIVE_MS + REV_PAUSE_MS + REV_TURN_MS)
  })
  it('цвета Мии на церемонии после B — с момента падения коробки (revBack), на обычной церемонии — с круга', () => {
    const m = { phase: 'in', fast: false }
    expect(miaColorOn(m, { sid: 'catch3-ann', revBack: 3000 }, true)).toBe(true); expect(miaColorOn(m, { sid: 'catch3-ann', revBack: 3000 }, false)).toBe(false)
    expect(miaColorOn(m, { sid: 'sprint3-ann', mia: 'ann' }, true)).toBe(false); expect(miaColorOn(m, { sid: 'sprint3-ann', mia: 'ann' }, true, true)).toBe(true)
  })
  it('проводка: плашка «Допрос у Мии» перед церемонией, три ноты ждут конца разворота (revBack.busy), круг Мии не обратный; привод конвейера слушает TURN_EVENT; тройная стрелка — маска ::after', () => {
    expect(rd('./raceStageKit.js')).toContain("title: 'Допрос у Мии'"); expect(rd('./raceStageKit.js')).toContain("reverse: o.reverse && sid === act.id, solo: sid === `${act.id}3` }), words: list")
    expect(rd('./useRaceActs.js')).toContain('mspeech.pending() > 0 || revBack.busy'); expect(rd('./mia/miaRound.js')).toContain("st.mia === 'intro' ? j + 4")
    expect(rd('../player/modules/rotate-phone/laneConveyorDrive.js')).toContain("addEventListener?.('wl-conveyor-turn', onTurn)"); expect(TURN_EVENT).toBe('wl-conveyor-turn')
    expect(rd('../../styles/player/modules/race-reverse.css')).toContain('data-arrow'); expect(rd('../../styles/player/modules/race-reverse.css')).toContain('mask:')
  })
})

describe('стадия разворота и уход Мии', () => {
  it('catch-rev: rev = REV_MS, реплика race_reverse (голос, switchTo ru) / race_reverse_tap; сцена reverse; директор держит стадию pitBusy + rev; плашки-подписи у разворота нет; Пит не перебивается — стрелки ждут его', () => {
    const c = rd('./raceStagesCatch.js'), a = rd('./useRaceActs.js'), p = rd('../player/modules/rotate-phone/useWordLanePills.js')
    expect(c).toContain("sid: 'catch-rev', rev: REV_MS"); expect(c).toContain("voice ? 'race_reverse' : 'race_reverse_tap'")
    expect(rd('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain("if (stageObj.rev || stageObj.revBack) return { kind: 'reverse', at: s.at, back: !!stageObj.revBack, speed: stageObj.revSpeed }")
    expect(a).toContain('revTimes(st.revSpeed ??= convSpeed.v).total + REV_START_SLACK_MS'); expect(a).toContain("plate: st => (st?.rev || st?.mia === 'intro'"); expect(a).toContain('mspeech.leftMs()')
    expect(p).toContain("fxRef.current?.pitBusy?.() ?? 0"); expect(p).toContain('tail < 30')
    expect(rd('../player/modules/rotate-phone/wordLanePool.js')).toContain("'data-up', 'data-arrow'") // у пилюли из пула стрелка не остаётся
  })
  it('afterLeaveSpeech: идём дальше только когда очередь речи пуста (и не раньше delay); страховка по числу опросов', () => {
    const timers = []; let pending = 2; const go = vi.fn()
    afterLeaveSpeech({ pending: () => pending, delay: 1200, go, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length } })
    expect(timers[0].ms).toBe(1200); timers.shift().fn(); expect(go).not.toHaveBeenCalled(); timers.shift().fn(); expect(go).not.toHaveBeenCalled()
    pending = 0; timers.shift().fn(); expect(go).toHaveBeenCalledTimes(1)
    const t2 = []; const go2 = vi.fn(); afterLeaveSpeech({ pending: () => 5, delay: 0, go: go2, setTimer: fn => { t2.push(fn); return t2.length } })
    for (let i = 0; i < LEAVE_MAX_POLLS + 2 && t2.length; i++) t2.shift()()
    expect(go2).toHaveBeenCalledTimes(1) // страховка
  })
})

import { clampSpeed, REV_SPEED_MIN, REV_SPEED_MAX, REV_RAMP_PCT } from './raceReverseTimes.js'
import { SPEED, ENTER_Y } from '../player/modules/rotate-phone/wordLaneTimeline.js'
describe('разворот идёт со скоростью конвейера (v3.3.277)', () => {
  it('равномерная часть приезда — ровно на скорости конвейера SPEED·k; у Мии (быстрее) разворот короче, у медленного — длиннее; множитель зажат', () => {
    const t = revTimes(1), path = Math.abs(50 - ENTER_Y)
    expect(((path - REV_RAMP_PCT) / (t.linear / 1000))).toBeCloseTo(SPEED, 0); expect(t.arrive).toBe(Math.round(((path + REV_RAMP_PCT) / SPEED) * 1000))
    expect(revTimes(1.5).arrive).toBeLessThan(t.arrive); expect(revTimes(0.8).arrive).toBeGreaterThan(t.arrive)
    expect(clampSpeed(0.2)).toBe(REV_SPEED_MIN); expect(clampSpeed(9)).toBe(REV_SPEED_MAX); expect(clampSpeed(undefined)).toBe(1)
    expect(revTimes(9)).toEqual(revTimes(REV_SPEED_MAX)); expect(t.total).toBe(t.lead + t.leave + 120); expect(t.ramp).toBe(t.arrive - t.linear)
  })
  it('прогон со скоростью Мии: длительности приезда и отъезда — по revTimes(speed); пилюли стартуют сразу (без ожидания Пита)', () => {
    const r = rig(); r.run({ speed: 1.5 }); const T = revTimes(1.5)
    for (const el of r.els) expect(el.animations[0].o.duration).toBe(T.arrive)
    expect(r.timers.map(x => x.ms).at(-1)).toBe(T.lead + T.leave + 40)
    expect(rd('../player/modules/rotate-phone/useWordLanePills.js')).toContain('const wait = 0')
  })
})

describe('вид пилюль разворота одинаков везде (v3.3.285)', () => {
  it('свечения нет ни при какой серии (огонь) и на слабом устройстве — не только в режиме Мии', () => {
    const css = rd('../../styles/player/modules/race-reverse.css')
    expect(css).toContain(".wl[data-race] .wlPill[data-arrow][data-cap], .weak-device .wl[data-race] .wlPill[data-arrow][data-cap] { box-shadow: none; filter: none; }")
  })
})
