import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runMirrorScene } from './wordLaneMirrorScene.js'
import { compareLayout, PIT_Y, YOU_Y } from '../../../rehearsal/mirror/mirrorCompare.js'
import { measureTake } from '../../../rehearsal/mirror/mirrorMeasure.js'
import { CHUNKS, DICTOR, STUDENT_CLEAN, STUDENT_MISSING } from '../../../rehearsal/mirror/mirrorFixtures.js'
import { runLanes, RUN_NONE } from './wordLaneRunLanes.js'
import { armedLanes } from './wordLaneConveyorStart.js'
import { createConveyorDrive } from './laneConveyorDrive.js'
import { PILL_H, FADE_TOP, FADE_BOTTOM } from './wordLaneTimeline.js'

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Подставной пул: пишет, что с пилюлями делали, и держит атрибуты как DOM
function fakePool(size = 12) {
  const els = Array.from({ length: size }, () => { const a = new Map(); return { attrs: a, setAttribute: (n, v) => a.set(n, String(v)), removeAttribute: n => a.delete(n), getAttribute: n => a.get(n) ?? null } })
  const free = els.map((_, i) => i).reverse()
  const calls = { take: [], place: [], paint: [], flash: [], unplace: [] }
  const pool = {
    take: (lane, opts) => { const k = free.pop(); calls.take.push({ k, lane, opts }); els[k].setAttribute('data-held', 1); els[k].setAttribute('data-lane', lane); return k },
    el: k => els[k],
    place: (k, y) => calls.place.push({ k, y }),
    unplace: k => calls.unplace.push(k),
    paintFill: (k, v) => { calls.paint.push({ k, v }); els[k].setAttribute('data-live', 1); els[k].setAttribute('data-ring', 1) },
    attr: (k, n, on = true) => (on ? els[k].setAttribute(n, 1) : els[k].removeAttribute(n)),
    flashLane: lane => calls.flash.push(lane),
  }
  return { pool, els, calls }
}
const sceneFor = student => ({ kind: 'mirror', layout: compareLayout({ chunks: CHUNKS, student: { url: 'blob:x' }, measure: measureTake({ dictor: DICTOR, student, chunks: CHUNKS }) }) })

describe('сцена «зеркало» движка пилюль: две ленты на остановленных дорожках', () => {
  it('чистый дубль: шесть пилюль без полёта — Пит сверху, ты снизу, на каждой дорожке пара; подписи «Пит» / «Ты»', () => {
    const { pool, els, calls } = fakePool()
    runMirrorScene({ pool, scene: sceneFor(STUDENT_CLEAN) })
    expect(calls.take).toHaveLength(6)
    expect(calls.take.every(t => t.opts.flight === false)).toBe(true) // без полёта: пилюли стоят
    expect(calls.take.map(t => t.lane)).toEqual([0, 1, 2, 0, 1, 2])
    expect(calls.place.map(p => p.y)).toEqual([PIT_Y, PIT_Y, PIT_Y, YOU_Y, YOU_Y, YOU_Y])
    expect(els.slice(0, 3).map(e => [e.attrs.get('data-still'), e.attrs.get('data-tag')])).toEqual([['pit', 'Пит'], ['pit', 'Пит'], ['pit', 'Пит']])
    expect(els.slice(3, 6).map(e => [e.attrs.get('data-still'), e.attrs.get('data-tag')])).toEqual([['you', 'Ты'], ['you', 'Ты'], ['you', 'Ты']])
  })
  it('заливка: у Пита полная; у «Ты» — по измерениям; залитые принятые (data-lock), пропуск — пустая с полосками data-wrong; искр и «выдоха» кольца нет', () => {
    const { pool, els, calls } = fakePool()
    runMirrorScene({ pool, scene: sceneFor(STUDENT_MISSING) })
    expect(calls.paint.map(p => p.v)).toEqual([1, 1, 1, 1, 0, 1])
    expect(els.slice(0, 6).map(e => e.attrs.has('data-lock'))).toEqual([true, true, true, true, false, true])
    expect(els.slice(0, 6).map(e => e.attrs.has('data-wrong'))).toEqual([false, false, false, false, true, false])
    expect(els[4].attrs.get('data-cmp')).toBe('missing')
    expect(els.slice(0, 6).every(e => !e.attrs.has('data-live') && !e.attrs.has('data-ring'))).toBe(true)
  })
  it('записи нет: только лента Пита (три пилюли)', () => {
    const { pool, calls } = fakePool()
    runMirrorScene({ pool, scene: { kind: 'mirror', layout: compareLayout({ chunks: CHUNKS, student: null }) } })
    expect(calls.take).toHaveLength(3)
  })
  it('lit(side, i): светится одна пилюля звучащего куска (data-voice) и вспыхивает его дорожка; следующий гасит прежнюю; lit(null) и пропущенный кусок гасят', () => {
    const { pool, els, calls } = fakePool()
    const run = runMirrorScene({ pool, scene: sceneFor(STUDENT_MISSING) })
    run.api.lit('pit', 1)
    expect(els.slice(0, 6).map(e => e.attrs.has('data-voice'))).toEqual([false, true, false, false, false, false]); expect(calls.flash).toEqual([1])
    run.api.lit('you', 2)
    expect(els.slice(0, 6).map(e => e.attrs.has('data-voice'))).toEqual([false, false, false, false, false, true]); expect(calls.flash).toEqual([1, 2])
    run.api.lit('you', 1) // пустая пилюля пропущенного куска тоже получает свечение, если её позовут (на деле расписание пропуска не зовёт)
    expect(els.filter(e => e.attrs.has('data-voice'))).toHaveLength(1)
    run.api.lit(null, -1)
    expect(els.some(e => e.attrs.has('data-voice'))).toBe(false)
    run.api.lit('pit', 0); run.stop()
    expect(els.some(e => e.attrs.has('data-voice'))).toBe(false); expect(calls.unplace).toHaveLength(6)
  })
  it('пул 12 пилюль вмещает сравнение; ленты не заходят в затемнение сверху и снизу', () => {
    expect(PIT_Y - PILL_H / 2).toBeGreaterThan(FADE_TOP + 6) // над верхней пилюлей остаётся место под подпись
    expect(YOU_Y + PILL_H / 2).toBeLessThan(100 - FADE_BOTTOM)
    expect(PIT_Y + PILL_H / 2).toBeLessThan(YOU_Y - PILL_H / 2) // ленты не налезают друг на друга
  })
})

describe('дорожки на стадии mirror плавно останавливаются сами', () => {
  it('стадия mirror ни одну дорожку не взводит: ни своей, ни с плашки перед ней', () => {
    const mirror = { type: 'mirror', act: 'mirror', step: { active: [0, 1, 2], parts: [0, 1, 2] } }
    expect(runLanes(mirror)).toBe(RUN_NONE)
    expect(armedLanes({ stageObj: mirror, nextStage: null, ignited: true })).toBe(RUN_NONE)
    expect(armedLanes({ stageObj: { type: 'announce', act: 'take' }, nextStage: mirror, ignited: true })).toBe(RUN_NONE) // даже плашка перед зеркалом ничего не зажигает
  })
  it('стоящие пилюли (data-still) привод не считает: дорожки под лентой остановлены, а летящие пилюли по-прежнему держат ход', () => {
    const src = read('./laneConveyorDrive.js')
    expect(src).toContain("root.querySelectorAll('.wlPill[data-held]:not([data-still])')")
    expect(src).toContain("attributeFilter: ['data-held', 'data-lane', 'data-still']")
    // привод на подставном DOM, где селектор исполняется как в браузере: пилюли [{ lane, still }]
    const cols = [0, 1, 2].map(() => { const c = { props: {}, style: { setProperty(k, v) { c.props[k] = v } } }; return c })
    let held = [], notify = () => {}, q = [], t = 1000
    const root = { querySelectorAll: sel => (sel === '.wlLanes i' ? cols : held.filter(p => !(sel.includes(':not([data-still])') && p.still)).map(p => ({ dataset: { lane: String(p.lane) } }))) }
    const drive = createConveyorDrive({ root, now: () => t, raf: f => { q.push(f); return q.length }, caf: () => { q = [] }, observe: (el, fn) => { notify = fn; return () => {} } })
    const frames = ms => { for (let el = 0; el < ms && q.length; el += 16) { t += 16; q.shift()(t) } }
    drive.setArmed('000'); held = [{ lane: 0, still: false }, { lane: 1, still: false }]; notify(); frames(2000)
    expect(drive.state().phases).toEqual(['run', 'run', 'idle'])
    held = [{ lane: 0, still: true }, { lane: 1, still: true }, { lane: 1, still: true }]; notify() // летящие улетели, на дорожках встала лента
    expect(drive.state().pills).toEqual([0, 0, 0]); frames(2500)
    expect(drive.state().phases).toEqual(['idle', 'idle', 'idle']); expect(drive.state().running).toBe(false)
  })
})
