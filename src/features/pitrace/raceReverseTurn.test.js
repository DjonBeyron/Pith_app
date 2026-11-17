// Разворот в реверс (raceReverseTurn.js), уход Мии без наползания реплик (mia/miaLeave.js) и стадия catch-rev (владелец 2026-11-17)
import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { miaColorOn } from './mia/miaTint.js'
import { runReverseTurn, revBack, TURN_EVENT, REV_MS, REV_ARRIVE_MS, REV_PAUSE_MS, REV_TURN_MS, REV_LEAVE_MS, REV_BACK_LEAD_MS } from './raceReverseTurn.js'
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

describe('разворот назад (церемония Мии после B)', () => {
  it('пилюли приезжают снизу (data-arrow = up) и уезжают вниз; узор дорожек возвращается вниз (data-up снят); busy снимается при возврате в пул', () => {
    const r = rig(); r.root.attrs['data-up'] = ''; revBack.busy = true; r.run({ back: true })
    expect(r.calls.filter(c => c[0] === 'attr' && c[2] === 'data-arrow').every(c => c[3] === 'up')).toBe(true)
    const f0 = r.els[0].animations[0].frames; expect(f0[0].translate).toContain('114.000dvh'); expect(f0[1].translate).toContain('50.000dvh') // снизу (100 − (−14)) в центр
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
    expect(rd('./raceStageKit.js')).toContain("title: 'Допрос у Мии'"); expect(rd('./raceStageKit.js')).toContain("sid === act.id }), words: list")
    expect(rd('./useRaceActs.js')).toContain('mspeech.pending() > 0 || revBack.busy'); expect(rd('./mia/miaRound.js')).toContain("st.mia === 'intro' ? j + 3")
    expect(rd('../player/modules/rotate-phone/laneConveyorDrive.js')).toContain("addEventListener?.('wl-conveyor-turn', onTurn)"); expect(TURN_EVENT).toBe('wl-conveyor-turn')
    expect(rd('../../styles/player/modules/race-reverse.css')).toContain('data-arrow'); expect(rd('../../styles/player/modules/race-reverse.css')).toContain('mask:')
  })
})

describe('стадия разворота и уход Мии', () => {
  it('catch-rev: rev = REV_MS, реплика race_reverse (голос, switchTo ru) / race_reverse_tap; сцена reverse; директор держит стадию pitBusy + rev; плашки-подписи у разворота нет; Пит не перебивается — стрелки ждут его', () => {
    const c = rd('./raceStagesCatch.js'), a = rd('./useRaceActs.js'), p = rd('../player/modules/rotate-phone/useWordLanePills.js')
    expect(c).toContain("sid: 'catch-rev', rev: REV_MS"); expect(c).toContain("voice ? 'race_reverse' : 'race_reverse_tap'")
    expect(rd('../player/modules/rotate-phone/useWordLaneFlow.js')).toContain("if (stageObj.rev || stageObj.revBack) return { kind: 'reverse', at: s.at, back: !!stageObj.revBack }")
    expect(a).toContain('pitBusy() + st.rev + 150'); expect(a).toContain("plate: st => (st?.rev || st?.mia === 'intro'"); expect(a).toContain('mspeech.leftMs()')
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
