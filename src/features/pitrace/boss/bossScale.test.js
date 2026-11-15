import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ZONES, EDGES, TICKS, zoneAt, spanOf, trackStep, lineOn, HOLD_MS, DEMO_START, DEMO_FROM, DEMO_TO, DEMO_MS, DEMO_TRIGGERS, DEMO_CUES, DEMO_CONVEYOR_SPEED, crossAt, flashOf } from './bossScale.js'
import { conveyorSpeedHint } from '../../player/modules/rotate-phone/wordLaneConveyorSpeed.js'
import { actArmedLanes } from '../../player/modules/rotate-phone/wordLaneConveyorStart.js'

describe('зоны шкалы: 45 % зелёная, 35 % жёлтая, 20 % красная', () => {
  it('границы по длине шкалы и зона по положению линии', () => {
    expect(ZONES.map(z => z.id)).toEqual(['fast', 'mid', 'slow']); expect(EDGES).toEqual([0, 0.45, 0.8])
    expect(spanOf('fast')).toBeCloseTo(0.45, 9); expect(spanOf('mid')).toBeCloseTo(0.35, 9); expect(spanOf('slow')).toBeCloseTo(0.2, 9)
    expect([0, 0.44, 0.45, 0.79, 0.8, 1, 1.2].map(zoneAt)).toEqual(['fast', 'fast', 'mid', 'mid', 'slow', 'slow', 'slow'])
  })
  it('риски: каждые 5 %, длинные на границах зон и краях, цвет — зона риски', () => {
    expect(TICKS).toHaveLength(21); expect(TICKS.filter(t => t.major).map(t => t.p)).toEqual([0, 0.45, 0.8, 1])
    expect(TICKS.find(t => t.p === 0.45).zone).toBe('mid'); expect(TICKS.find(t => t.p === 0.8).zone).toBe('slow'); expect(TICKS.at(-1).zone).toBe('slow'); expect(TICKS[0].zone).toBe('fast')
  })
})

describe('какую пилюлю толкает линия', () => {
  const H = 600, el = { id: 'pill-1' }
  const pill = (o = {}) => ({ el, top: 0, bottom: 80, locked: false, failed: false, ...o })
  it('линия появляется, когда нижний край пилюли коснулся верха шкалы (bottom > 0), а до касания пилюлю не берёт', () => {
    expect(trackStep(null, [pill({ top: -100, bottom: -2 })], H, 0)).toBe(null)
    expect(trackStep(null, [pill({ top: -80, bottom: 1 })], H, 0)).toMatchObject({ el, y: 1, done: false })
  })
  it('едет за нижним краем, замирает на ответе и держится HOLD_MS', () => {
    let tr = trackStep(null, [pill({ top: -80, bottom: 5 })], H, 0)
    tr = trackStep(tr, [pill({ top: 100, bottom: 180 })], H, 100); expect(tr.y).toBe(180)
    tr = trackStep(tr, [pill({ top: 200, bottom: 280, locked: true })], H, 200); expect(tr).toMatchObject({ done: true, y: 180, at: 200 }); expect(lineOn(tr, 200 + HOLD_MS - 1)).toBe(true); expect(lineOn(tr, 200 + HOLD_MS)).toBe(false)
  })
  it('ТА ЖЕ пилюля-узел для следующего слова (пул переиспользует элементы): линия берёт её заново, а не молчит', () => {
    let tr = trackStep(null, [pill({ top: 300, bottom: 380 })], H, 0)
    tr = trackStep(tr, [pill({ top: 320, bottom: 400, locked: true })], H, 50); expect(tr.done).toBe(true)
    tr = trackStep(tr, [pill({ top: -70, bottom: 10 })], H, 900); expect(tr).toMatchObject({ el, y: 10, done: false })
  })
  it('«не успел» (failed) и уход далеко вниз закрывают пилюлю (ниже конца шкалы линия стоит красной, пока движок не скажет «не успел»); принятую заново не берёт', () => {
    const tr = trackStep(null, [pill()], H, 0)
    expect(trackStep(tr, [pill({ failed: true })], H, 10).done).toBe(true)
    expect(trackStep(tr, [pill({ top: H * 1.1, bottom: H * 1.1 + 80 })], H, 10).done).toBe(false) // чуть ниже шкалы — линия ещё стоит у конца
    expect(trackStep(tr, [pill({ top: H * 1.3, bottom: H * 1.3 + 80 })], H, 10).done).toBe(true)
    const done = trackStep(tr, [pill({ locked: true })], H, 10); expect(trackStep(done, [pill({ locked: true })], H, 20)).toBe(done)
    expect(trackStep(null, [], H, 0)).toBe(null)
  })
})

describe('пример при объяснении: пилюля едет ровно и сама запускает реплики о зонах', () => {
  const css = readFileSync(new URL('../../../styles/player/modules/race-boss.css', import.meta.url), 'utf8')
  it('одна ровная анимация на всё объяснение (18 с), старт с «видите шкалу справа?», пилюля уезжает за нижний край (до +125 %); границы зон и касание — ступени keyframes в тех же долях пути', () => {
    expect(DEMO_START).toBe('boss_mia_look'); expect(DEMO_MS).toBe(18000); expect(DEMO_FROM).toBe(-0.75); expect(DEMO_TO).toBe(1.25)
    const frac = p => ((p - DEMO_FROM) / (DEMO_TO - DEMO_FROM)) * 100
    expect(frac(0)).toBeCloseTo(37.5, 6); expect(frac(0.45)).toBeCloseTo(60, 6); expect(frac(0.8)).toBeCloseTo(77.5, 6); expect(frac(1)).toBeCloseTo(87.5, 6)
    expect(css).toContain('from { top: -75%; } to { top: 125%; }'); expect(css).toContain('linear 1 both')
    expect(css).toContain('0%, 59.9% { --zc: 120, 230, 150; }'); expect(css).toContain('60%, 77.4% { --zc: 255, 200, 70; }'); expect(css).toContain('77.5%, 100% { --zc: 255, 96, 80; }') // линия: ступенями, зелёная с выезда
    expect(css).toContain('0%, 60% { --pc: 120, 230, 150; } 65%, 77.5% { --pc: 255, 200, 70; } 82.5%, 100% { --pc: 255, 96, 80; }') // пилюля: плавно (рампа 5 % пути после границы зоны)
    expect(css).toContain('@keyframes wlBossShow { 0%, 37.5% { opacity: 0; } 43% { opacity: 1; } 86.5% { opacity: 1; } 87.5%, 100% { opacity: 0; } }') // линия проявляется на касании и у нижней отметки быстро растворяется
  })
  it('реплики о зонах запускает сама пилюля на входе в зону (мс от старта примера): зелёная — на касании, жёлтая — на 45 %, красная — на 80 %, «пять красных» — у низа; в порядке пути', () => {
    expect(DEMO_TRIGGERS.map(t => t[1])).toEqual(['fast', 'mid', 'slow', 'end']); expect(DEMO_TRIGGERS.map(t => Math.round(t[0]))).toEqual([Math.round(crossAt(0)), Math.round(crossAt(0.45)), Math.round(crossAt(0.8)), Math.round(crossAt(1))]); expect(crossAt(1)).toBeLessThan(DEMO_MS) // «пять красных» — у низа шкалы, пилюля после этого уезжает за экран
    expect(DEMO_TRIGGERS.map(t => t[0])).toEqual([...DEMO_TRIGGERS.map(t => t[0])].sort((a, b) => a - b))
    expect(DEMO_CUES.fast[0].id).toBe('boss_mia_green'); expect(DEMO_CUES.mid[0].id).toBe('boss_mia_yellow'); expect(DEMO_CUES.slow[0].id).toBe('boss_mia_red'); expect(DEMO_CUES.end.map(c => c.id)).toEqual(['boss_mia_five', 'boss_pit_no'])
    expect(crossAt(0)).toBeGreaterThan(6000) // до входа в зелёную успевают «видите шкалу» и «чем дольше думаете»
    expect(flashOf({ id: 'boss_mia_red', key: 2, ms: 900 })).toEqual({ zone: 'slow', key: 2, ms: 900 })
  })
  it('линия: без растушёвки и свечения, утончается от левого края пилюли (clip-path, 11 % ширины); пилюля финала меняет цвет плавно (--bz, переход)', () => {
    expect(css).toContain('clip-path: polygon(0 50%, 11% 0, 100% 0, 100% 100%, 11% 100%)'); expect(css).not.toMatch(/\.wlBossLine \{[^}]*box-shadow/); expect(css).toContain('@property --bz'); expect(css).toContain('transition: --bz 0.5s ease')
  })
  it('конвейер на церемонии финала едет под пример: скорость DEMO_CONVEYOR_SPEED, дорожки взведены с самого начала (до зажигания)', () => {
    const ann = { race: true, act: 'boss', type: 'announce', sid: 'boss-ann', idx: 0, demoRun: true }, round = { race: true, act: 'boss', type: 'student', idx: 1, step: { kind: 'student', active: [1], reps: [{ lane: 1, speed: 0.5 }], lanes: [1] } }
    expect(conveyorSpeedHint([ann, round], 0)).toBe(DEMO_CONVEYOR_SPEED); expect(conveyorSpeedHint([ann, round], 1)).toBe(0.5)
    expect(actArmedLanes({ stages: [ann, round], idx: 0, ignited: false }).includes('2')).toBe(true)
    expect(actArmedLanes({ stages: [{ ...ann, demoRun: false }, round], idx: 0, ignited: false })).not.toContain('2') // без demoRun на первой плашке акта до зажигания дорожки стоят
  })
})
