import { describe, it, expect } from 'vitest'
import { createVoiceSetSession, WARN_GAP_MS, SECTION_GAP_MS } from './voiceSetSession.js'
import { createChunkMeter, clipStats } from './voiceSetMeter.js'
import { createMemoryStore, resumeInfo } from './voiceSetStore.js'
import { buildPlan, GAP_MS, PRE_MS, WORD_MS } from './voiceSetPlan.js'

// Ход записи набора: окно по отсчётам звука, предзапись, пауза, «Переписать прошлый», «Пропустить», возобновление набора; числа клипа
const CH = 2048 / 48000 * 1000 // длина куска, мс
const tick = () => new Promise(r => setTimeout(r, 0))

function rig({ plan = buildPlan({ words: ['house', 'milk'], reps: 1 }).filter(x => x.kind === 'word'), done = [], skipped = [], failSave = false } = {}) {
  plan.forEach((it, i) => { it.i = i })
  const timers = new Map(), states = [], saved = [], dropped = [], skips = []
  let tid = 0
  const meter = createChunkMeter()
  const s = createVoiceSetSession({
    plan, done, skipped,
    save: async (it, clip) => { if (failSave) throw new Error('QuotaExceededError'); saved.push({ i: it.i, n: clip.chunks.length, stats: clip.stats, preMs: clip.preMs }) },
    drop: async i => { dropped.push(i) }, onSkip: l => skips.push(l), onState: st => states.push(st),
    setTimer: (fn, ms) => { timers.set(++tid, { fn, ms }); return tid }, clearTimer: id => timers.delete(id),
  })
  const fire = () => { const [id, t] = [...timers][0]; timers.delete(id); t.fn(); return t.ms }
  const feed = (ms, rms = 0.0003) => { for (let t = 0; t < ms; t += CH) s.chunk({ data: new Float32Array(4), ...meter.push(rms, rms * 3.3, CH) }) }
  /** Пройти одно задание: пауза-показ → окно со словом (голос 500 мс посередине) → сохранение */
  const clipOnce = async ({ voice = true } = {}) => { const gap = fire(); feed(600); if (voice) feed(500, 0.01); feed(WORD_MS); await tick(); return gap }
  return { s, plan, timers, states, saved, dropped, skips, fire, feed, clipOnce, last: () => states.at(-1) }
}

describe('ход записи набора', () => {
  it('старт → показ задания (пауза) → окно → клип сохранён → следующее задание само', async () => {
    const r = rig()
    r.s.start()
    expect(r.last()).toMatchObject({ phase: 'gap', i: 0, done: 0, total: 10 })
    expect(r.last().item.text).toBe('house'); expect(r.last().after.i).toBe(1)
    r.feed(700)
    expect(r.fire()).toBe(SECTION_GAP_MS) // первое задание раздела — пауза длиннее
    expect(r.last()).toMatchObject({ phase: 'rec', recKey: 1 })
    r.feed(WORD_MS - 100)
    expect(r.saved).toHaveLength(0)
    r.feed(150)
    expect(r.last().phase).toBe('saving')
    await tick()
    expect(r.saved).toHaveLength(1)
    expect(r.saved[0].preMs).toBeGreaterThanOrEqual(PRE_MS); expect(r.saved[0].preMs).toBeLessThan(PRE_MS + CH + 1)
    expect(r.saved[0].stats.ms).toBeGreaterThanOrEqual(WORD_MS + PRE_MS); expect(r.saved[0].stats.ms).toBeLessThan(WORD_MS + PRE_MS + 2 * CH + 1)
    expect(r.last()).toMatchObject({ phase: 'gap', i: 1, done: 1, left: 9 })
    expect([...r.timers.values()][0].ms).toBe(WARN_GAP_MS) // голоса в клипе не было — пауза дольше, есть время переписать
    expect(r.last().warn).toEqual({ kind: 'novoice', i: 0 })
  })
  it('клип с голосом — без предупреждения и обычная пауза 0,7 с; весь набор доходит до конца', async () => {
    const r = rig()
    r.s.start()
    await r.clipOnce()
    expect(r.last().warn).toBe(null)
    expect([...r.timers.values()][0].ms).toBe(GAP_MS)
    for (let k = 1; k < 10; k++) await r.clipOnce()
    expect(r.last()).toMatchObject({ phase: 'done', done: 10, left: 0 })
    expect(r.saved.map(x => x.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(r.saved[3].stats).toMatchObject({ noVoice: false, late: false })
    expect(r.saved[3].stats.voiceMs).toBeGreaterThan(400)
  })
  it('пауза посреди окна выбрасывает клип; «Продолжить» переписывает то же задание', async () => {
    const r = rig()
    r.s.start(); r.fire(); r.feed(1000)
    r.s.pause()
    expect(r.last()).toMatchObject({ phase: 'paused', pauseWhy: 'user', i: 0 })
    r.feed(5000)
    expect(r.saved).toHaveLength(0)
    r.s.resume()
    expect(r.last()).toMatchObject({ phase: 'gap', i: 0 })
    expect(await r.clipOnce()).toBe(SECTION_GAP_MS) // после «Продолжить» пауза-показ длиннее
    expect(r.saved.map(x => x.i)).toEqual([0])
  })
  it('«Переписать прошлый»: клип удаляется, задание пишется заново, потом ход возвращается', async () => {
    const r = rig()
    r.s.start()
    await r.clipOnce(); await r.clipOnce()
    expect(r.last()).toMatchObject({ i: 2, done: 2, canRedo: true })
    await r.s.redoPrev()
    expect(r.dropped).toEqual([1])
    expect(r.last()).toMatchObject({ phase: 'gap', i: 1, done: 1 })
    await r.clipOnce()
    expect(r.last()).toMatchObject({ phase: 'gap', i: 2, done: 2 })
    await r.s.redoPrev(); await r.s.redoPrev()
    expect(r.dropped).toEqual([1, 1, 0])
    expect(r.last()).toMatchObject({ i: 0, done: 0, canRedo: false })
    expect(await r.s.redoPrev()).toBe(false)
  })
  it('«Пропустить»: задание не пишется и больше не спрашивается; «Переписать прошлый» возвращает пропущенное', async () => {
    const r = rig()
    r.s.start()
    await r.clipOnce()
    r.s.skip()
    expect(r.skips.at(-1)).toEqual([1])
    expect(r.last()).toMatchObject({ phase: 'gap', i: 2, skipped: 1, left: 8 })
    await r.s.redoPrev()
    expect(r.skips.at(-1)).toEqual([])
    expect(r.dropped).toEqual([])
    expect(r.last()).toMatchObject({ i: 1, skipped: 0 })
  })
  it('микрофон отключился — пауза с причиной; пауза человека причину не перебивает', () => {
    const r = rig()
    r.s.start(); r.fire(); r.feed(500)
    r.s.pause('mic')
    expect(r.last()).toMatchObject({ phase: 'paused', pauseWhy: 'mic' })
    r.s.pause('user')
    expect(r.last().pauseWhy).toBe('mic')
    r.s.resetRing(); r.s.resume(); r.fire()
    expect(r.last().phase).toBe('rec')
  })
  it('блок «на вытянутой руке» сам встаёт на паузу один раз; клип не сохранился — пауза с ошибкой', async () => {
    const plan = buildPlan({ words: ['cat'], reps: 1, far: true }).filter(x => x.kind === 'word').slice(-3)
    const r = rig({ plan })
    r.s.start()
    await r.clipOnce()
    expect(r.last()).toMatchObject({ phase: 'hold', i: 1 })
    expect(r.last().item.hold).toMatch(/вытянутой/)
    r.s.resume()
    expect(r.last().phase).toBe('gap')
    const bad = rig({ failSave: true })
    bad.s.start(); await bad.clipOnce()
    expect(bad.last()).toMatchObject({ phase: 'paused', pauseWhy: 'save', done: 0 })
    expect(bad.last().error).toMatch(/Quota/)
  })
  it('«Закончить» останавливает запись; сделанное остаётся', async () => {
    const r = rig()
    r.s.start(); await r.clipOnce(); r.fire(); r.feed(300)
    r.s.finish()
    expect(r.last()).toMatchObject({ phase: 'done', done: 1 })
    r.feed(5000)
    expect(r.saved).toHaveLength(1)
  })
})

describe('возобновление набора', () => {
  it('после перезагрузки запись идёт с первого незаписанного; пропущенные не спрашиваются', async () => {
    const plan = buildPlan({ words: ['house', 'milk'], reps: 1 }), store = createMemoryStore()
    expect(await store.load()).toBe(null)
    await store.saveMeta({ sig: 'x', skipped: [3] })
    for (const i of [0, 1, 2, 4]) await store.putClip({ i, file: plan[i].file, bytes: 1000 }, new ArrayBuffer(1000))
    const got = await store.load()
    expect(resumeInfo(plan, got.clips, got.meta.skipped)).toEqual({ done: 4, total: plan.length, skipped: 1, next: 5, bytes: 4000 })
    const r = rig({ plan: plan.slice(), done: got.clips.map(c => c.i), skipped: got.meta.skipped })
    r.s.start()
    expect(r.last()).toMatchObject({ phase: 'gap', i: 5, done: 4, skipped: 1 })
    await store.dropClip(2)
    expect((await store.load()).clips.map(c => c.i)).toEqual([0, 1, 4])
    expect(await store.getAudio(2)).toBe(null)
    expect((await store.getAudio(4)).byteLength).toBe(1000)
    await store.clear()
    expect(await store.load()).toBe(null)
  })
  it('всё записано — следующего нет', () => {
    const plan = buildPlan({ words: ['cat'], reps: 1 })
    expect(resumeInfo(plan, plan.map(it => ({ i: it.i, bytes: 10 })), []).next).toBe(null)
    expect(resumeInfo(plan, [], []).next).toBe(0)
  })
})

describe('числа клипа', () => {
  it('пик и фон сырого звука, пик после усиления игры, голос по счётчику voskVoice, поздний голос, ровный ноль', () => {
    const m = createChunkMeter(), ch = []
    const feed = (ms, rms, k = 3.3) => { for (let t = 0; t < ms; t += CH) ch.push(m.push(rms, rms * k, CH)) }
    feed(500, 0.0003); feed(600, 0.0003); feed(430, 0.004); feed(1200, 0.0003)
    const s = clipStats(ch, { preMs: 500 })
    expect(s.rmsPeak).toBe(0.004); expect(s.rmsNoise).toBe(0.0003); expect(s.gamePeak).toBeCloseTo(0.0132, 5)
    expect(s.gameNoise).toBeCloseTo(0.00099, 4)
    expect(s.voiceMs).toBeGreaterThan(380); expect(s.voiceMs).toBeLessThan(480)
    expect(s.voiceOnMs).toBeGreaterThan(1050); expect(s.voiceOffMs).toBeLessThan(1700)
    expect(s).toMatchObject({ noVoice: false, late: false, early: false, zeros: 0 })
    const late = []; for (let t = 0; t < 2000; t += CH) late.push(m.push(t > 1500 ? 0.004 : 0.0003, t > 1500 ? 0.0132 : 0.001, CH))
    expect(clipStats(late).late).toBe(true)
    const dead = [m.push(0, 0, CH), m.push(0, 0, CH)]
    expect(clipStats(dead)).toMatchObject({ zeros: 2, noVoice: true, rmsPeak: 0, rmsNoise: 0 })
  })
})
