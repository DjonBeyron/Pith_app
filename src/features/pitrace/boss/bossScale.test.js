import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ZONES, EDGES, TICKS, zoneAt, spanOf, trackStep, lineOn, HOLD_MS, DEMO_START, DEMO_IDS, DEMO_FROM, DEMO_OUT, DEMO_GAP_MS, DEMO_MOVE_MS, DEMO_CENTERS, demoPlan, zoneRgb, flashOf, marksStep, MARKS_MAX, MARK_FADE_MS } from './bossScale.js'
import { RISE_DELAY_MS, RISE_MS, RISE_EASING } from '../../player/modules/rotate-phone/wordLaneRise.js'
import { conveyorSpeedHint } from '../../player/modules/rotate-phone/wordLaneConveyorSpeed.js'
import { actArmedLanes } from '../../player/modules/rotate-phone/wordLaneConveyorStart.js'

const css = readFileSync(new URL('../../../styles/player/modules/race-boss.css', import.meta.url), 'utf8')

describe('зоны шкалы: 45 % зелёная, 35 % жёлтая, 20 % красная', () => {
  it('границы по длине шкалы и зона по положению линии', () => {
    expect(ZONES.map(z => z.id)).toEqual(['fast', 'mid', 'slow']); expect(EDGES).toEqual([0, 0.45, 0.8])
    expect(spanOf('fast')).toBeCloseTo(0.45, 9); expect(spanOf('mid')).toBeCloseTo(0.35, 9); expect(spanOf('slow')).toBeCloseTo(0.2, 9)
    expect([0, 0.44, 0.45, 0.79, 0.8, 1, 1.2].map(zoneAt)).toEqual(['fast', 'fast', 'mid', 'mid', 'slow', 'slow', 'slow'])
  })
  it('риски: каждые 5 %, длинные на границах зон и краях, цвет — зона риски', () => {
    expect(TICKS).toHaveLength(21); expect(TICKS.filter(t => t.border).map(t => t.p)).toEqual([0.45, 0.8]); // риски границ зон длиннее и толще (v3.3.282)
     expect(TICKS.filter(t => t.major).map(t => t.p)).toEqual([0.45, 0.8]) // верхняя и нижняя риски — маленькие (v3.3.284)
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
    tr = trackStep(tr, [pill({ top: 200, bottom: 280, locked: true })], H, 200); expect(tr).toMatchObject({ done: true, y: 280, at: 200 }); /* v3.3.375: locked — пилюля ВСТАЛА (data-rise); линия — там, где она встала, а не кадром раньше */ expect(lineOn(tr, 200 + HOLD_MS - 1)).toBe(true); expect(lineOn(tr, 200 + HOLD_MS)).toBe(false)
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

describe('пример при объяснении: пилюля встаёт в центр каждой зоны', () => {
  const ms = { look: 2500, green: 1500, yellow: 1600, red: 1700, five: 3000 }
  const plan = demoPlan(ms), g = DEMO_GAP_MS, M = DEMO_MOVE_MS
  const st = plan.starts
  it('реплики подряд: старты = сумма длительностей + пауза очереди; ждёт за верхним краем до перехода к центру зелёной зоны', () => {
    expect(DEMO_START).toBe('boss_mia_look'); expect(DEMO_IDS).toEqual(['boss_mia_look', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five']); expect(DEMO_FROM).toBe(-0.75); expect(DEMO_OUT).toBe(1.25)
    expect(st.look).toBe(0); expect(st.green).toBe(ms.look + g); expect(st.yellow).toBe(st.green + ms.green + g); expect(st.red).toBe(st.yellow + ms.yellow + g); expect(st.five).toBe(st.red + ms.red + g)
    expect(plan.pos(0)).toBe(DEMO_FROM); expect(plan.pos(st.green - M - 1)).toBe(DEMO_FROM)
  })
  it('к началу реплики о зоне пилюля уже в центре этой зоны (0,225 / 0,625 / 0,9) и стоит, пока Мия о ней говорит; к началу следующей — в центре следующей', () => {
    expect(DEMO_CENTERS.map(c => +c.toFixed(3))).toEqual([0.225, 0.625, 0.9])
    for (const [k, c, len] of [['green', 0, ms.green], ['yellow', 1, ms.yellow], ['red', 2, ms.red]]) {
      expect(plan.pos(st[k])).toBeCloseTo(DEMO_CENTERS[c], 9)
      for (const f of [0.1, 0.5, 0.75]) expect(plan.pos(st[k] + len * f)).toBeCloseTo(DEMO_CENTERS[c], 9) // стоит
    }
    expect(zoneAt(plan.pos(st.green))).toBe('fast'); expect(zoneAt(plan.pos(st.yellow))).toBe('mid'); expect(zoneAt(plan.pos(st.red))).toBe('slow')
  })
  it('переход плавный, но быстрый (DEMO_MOVE_MS 650 мс): не рывок и не вечность; никогда не возвращается назад; после «красной» улетает за нижний край экрана', () => {
    expect(M).toBeLessThanOrEqual(800); expect(M).toBeGreaterThanOrEqual(400)
    let prev = plan.pos(0); for (let t = 20; t <= plan.total; t += 20) { const p = plan.pos(t); expect(p).toBeGreaterThanOrEqual(prev - 1e-9); prev = p }
    const mid = plan.pos(st.yellow - M / 2); expect(mid).toBeGreaterThan(DEMO_CENTERS[0]); expect(mid).toBeLessThan(DEMO_CENTERS[1]) // посреди перехода — между центрами
    expect(plan.pos(st.five + 400)).toBe(DEMO_OUT); expect(plan.pos(st.five - M)).toBeCloseTo(DEMO_CENTERS[2], 9)
  })
  it('цвет примера: зелёный в центре зелёной, плавный переход между зонами, красный в красной; flashOf даёт зону мигания', () => {
    expect(zoneRgb(0.2)).toEqual([120, 230, 150]); expect(zoneRgb(0.45)).not.toEqual([120, 230, 150]); expect(zoneRgb(0.45)).not.toEqual([255, 200, 70]); expect(zoneRgb(0.6)).toEqual([255, 200, 70]); expect(zoneRgb(1)).toEqual([255, 96, 80])
    expect(flashOf({ id: 'boss_mia_red', key: 2, ms: 900 })).toEqual({ zone: 'slow', key: 2, ms: 900 })
  })
  it('верный ответ: линия уходит слева направо за время взлёта пилюли (RISE_DELAY_MS + RISE_MS) с тем же easing; фиолетовые маркеры слов — треугольники острием вправо, остриё на стволе линейки', () => {
    expect(RISE_DELAY_MS + RISE_MS).toBe(930); expect(css).toContain(`wlBossLineOut ${RISE_DELAY_MS + RISE_MS}ms ${RISE_EASING}`); expect(css).toContain('.wlBossLine[data-exit] { transform-origin: 100% 50%;'); expect(css).toContain('from { scale: 1 1; } to { scale: 0 1; }')
    expect(css).toMatch(/\.wlBossMark \{[^}]*right: 6px[^}]*width: 10px[^}]*#a78bfa[^}]*clip-path: polygon\(0 0, 100% 50%, 0 100%\)/); expect(css).toMatch(/\.wlBossZone \{[^}]*right: 4px; width: 28px[^}]*linear-gradient\(to right, rgba\(var\(--zc\), 0\)/); expect(css).toMatch(/\.wlBossMark\[data-set\] \{ scale: 1\.2/) // v3.3.285: маркер ответа на 20 % крупнее; левый край зон — градиент от 0 // остриё на «стволе» линейки (правая кромка зон); v3.3.285: левая граница зон шире и растушёвана
    const src = readFileSync(new URL('./bossScaleDrive.js', import.meta.url), 'utf8'); expect(src).toContain('marksStep(slots'); expect(src).toContain('el.dataset.exit')
  })
  it('линия: без растушёвки и свечения, утончается от левого края пилюли (clip-path 11 %); пилюля финала меняет цвет плавно (--bz, переход 0,5 с); мигание появления шкалы 2,4 с', () => {
    expect(css).toContain('clip-path: polygon(0 50%, 11% 0, 100% 0, 100% 100%, 11% 100%)'); expect(css).not.toMatch(/\.wlBossLine \{[^}]*box-shadow/); expect(css).toContain('@property --bz'); expect(css).not.toContain('transition: --bz'); // цвет пилюли — мгновенно
     expect(css).toContain('wlBossIn 2.4s ease-in-out')
  })
  it('конвейер на церемонии финала: подсказка скорости — как в круге финала (одна скорость), дорожки взведены с самого начала (до зажигания); без demoRun на первой плашке акта до зажигания дорожки стоят', () => {
    const ann = { race: true, act: 'boss', type: 'announce', sid: 'boss-ann', idx: 0, demoRun: true }, round = { race: true, act: 'boss', type: 'student', idx: 1, step: { kind: 'student', active: [1], reps: [{ lane: 1, speed: 0.5 }], lanes: [1] } }
    expect(conveyorSpeedHint([ann, round], 0)).toBe(0.5); expect(conveyorSpeedHint([ann, round], 1)).toBe(0.5)
    expect(actArmedLanes({ stages: [ann, round], idx: 0, ignited: false }).includes('2')).toBe(true)
    expect(actArmedLanes({ stages: [{ ...ann, demoRun: false }, round], idx: 0, ignited: false })).not.toContain('2')
  })
})

describe('маркеры слов (фиолетовые треугольники)', () => {
  it('у каждого слова свой маркер, живых не больше двух; верно названное слово оставляет маркер на месте ответа', () => {
    expect(MARKS_MAX).toBe(2)
    let s = marksStep([], { id: 1, y: 0.1, now: 0 }); expect(s).toEqual([{ id: 1, k: 0, y: 0.1, dying: 0 }])
    s = marksStep(s, { id: 1, y: 0.3, now: 100 }); s = marksStep(s, { id: 1, y: 0.2, now: 200 }); expect(s[0].y).toBe(0.3) // идёт вниз, не вверх
    s = marksStep(s, { id: null, y: 0, now: 5000 }); expect(s).toHaveLength(1); expect(s[0].y).toBe(0.3) // слово названо — маркер остался на месте
  })
  it('второе слово не названо: на сцене два маркера (первый на месте ответа, второй упёрся в низ)', () => {
    let s = marksStep([], { id: 1, y: 0.3, now: 0 })
    for (const y of [0.1, 0.5, 0.9, 1]) s = marksStep(s, { id: 2, y, now: 1000 })
    expect(s.map(x => [x.id, x.k, x.y, x.dying])).toEqual([[1, 0, 0.3, 0], [2, 1, 1, 0]])
  })
  it('третье слово: самый старый маркер плавно гаснет (dying), через MARK_FADE_MS освобождает узел; новый берёт свободный узел', () => {
    let s = marksStep([], { id: 1, y: 0.3, now: 0 }); s = marksStep(s, { id: 2, y: 1, now: 100 })
    s = marksStep(s, { id: 3, y: 0.05, now: 2000 })
    expect(s.find(x => x.id === 1).dying).toBe(2000); expect(s.find(x => x.id === 2).dying).toBe(0); expect(s.find(x => x.id === 3)).toMatchObject({ k: 2, y: 0.05, dying: 0 }) // три узла: два живых и гаснущий
    expect(s.filter(x => !x.dying)).toHaveLength(2)
    s = marksStep(s, { id: 3, y: 0.2, now: 2000 + MARK_FADE_MS + 1 }); expect(s.map(x => x.id)).toEqual([2, 3]); // первый ушёл
    s = marksStep(s, { id: 4, y: 0, now: 4000 }); expect(s.find(x => x.id === 4).k).toBe(0) // освободившийся узел переиспользуется
  })
})
