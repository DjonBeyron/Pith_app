import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { reduceMia, miaInit } from './raceMia.js'
import { createMiaSpeech } from './miaSpeech.js'
import { miaLine } from './miaLines.js'
import { HELP_LINES } from '../boss/bossHelp.js'
import { endHoldMs } from '../boss/raceEndHold.js'

// Замечание владельца (iPhone, v3.3.339): в экзамене (финал «Шкала памяти») на ошибке / «не успел» порядок речи — колкость Мии → Пит называет слово, которое не получилось →
// Пит «следующее слово» → следующее слово (его говорит диктор у выехавшей пилюли); в конце экзамена Мия не говорит «а я пошла», диалог Пита «попробую выбраться / помоги» не запускается.
const W = [['meet', 'встретить'], ['trying', 'пытаюсь'], ['remember', 'помнить']].map(([text, translation]) => ({ text, translation }))
const exam = (o = {}) => ({ mia: 'round', silent: true, act: 'boss', sid: 'boss', words: W, step: {}, ...o })
const start = stage => reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage }).mia
const brief = r => r.say.map(c => [c.who, c.id, c.word ?? '', c.delay ?? 0])

describe('экзамен: порядок речи на ошибке и «не успел»', () => {
  it('«не успел» (fail): колкость Мии сразу → Пит «это значит» + несданное слово → Пит «следующее слово»', () => {
    const st = exam(), r = reduceMia(start(st), { t: 'fail', stage: st, idx: 0 })
    expect(brief(r)).toEqual([['mia', 'boss_mia_miss_2', '', 0], ['pit', HELP_LINES[0], 'meet', 0], ['pit', 'boss_pit_next', '', 0]]) // колкость по причине: «не успел» — «Слово ушло, трофеи тоже» (было: по кругу, первая — boss_mia_miss_1)
    expect(r.say[1].ru).toBeFalsy()
  })
  it('сказал неверно (miss): пока пилюля едет — тишина (ученик может поправиться); пилюля ушла — тот же порядок, один раз на слово; фраза помощи идёт по кругу', () => {
    const st = exam(), a = reduceMia(start(st), { t: 'miss', stage: st, idx: 0 })
    expect(a.say).toEqual([])
    const b = reduceMia(a.mia, { t: 'fail', stage: st, idx: 0 })
    expect(b.say.map(c => c.id)).toEqual(['boss_mia_miss_1', HELP_LINES[0], 'boss_pit_next'])
    expect(reduceMia(b.mia, { t: 'fail', stage: st, idx: 0 }).say).toEqual([])
    expect(reduceMia(b.mia, { t: 'fail', stage: st, idx: 1 }).say.map(c => c.id)).toEqual(['boss_mia_miss_2', HELP_LINES[1], 'boss_pit_next'])
  })
  it('последнее слово блока: «следующее слово» не говорится (дальше не слово, а Мия или конец)', () => {
    const st = exam(), r = reduceMia(start(st), { t: 'fail', stage: st, idx: 2 })
    expect(r.say.map(c => c.id)).toEqual(['boss_mia_miss_2', HELP_LINES[0]])
  })
  it('русский блок: несданное слово — перевод (русская озвучка)', () => {
    const st = exam({ sid: 'boss2', offset: 3, step: { lang: 'ru' } }), m = reduceMia({ ...start(exam()), fast: true }, { t: 'enter', stage: st }).mia
    const r = reduceMia(m, { t: 'fail', stage: st, idx: 0 })
    expect(r.say[1]).toMatchObject({ who: 'pit', word: 'встретить', ru: true }); expect(r.say.at(-1).id).toBe('boss_pit_next')
  })
  it('реплика «следующее слово» есть в каталоге, её говорит Пит', () => {
    expect(miaLine('boss_pit_next')).toMatchObject({ who: 'pit', text: 'Следующее слово' })
  })
  it('«Допрос у Мии» (не экзамен) : колкость Мии — когда пилюля ушла (на неверное слово при едущей пилюле молчит, v3.3.348), Пит ничего не добавляет', () => {
    const st = { mia: 'round', act: 'catch', sid: 'catch3', words: W }, m = reduceMia({ ...miaInit(), phase: 'in', act: 'catch' }, { t: 'enter', stage: st }).mia
    expect(brief(reduceMia(m, { t: 'fail', stage: st, idx: 0 }))).toEqual([['mia', 'mia_miss_1', '', 0]]) // в «Допросе» прежние колкости (mia_miss_*), в экзамене — boss_mia_miss_* про трофеи
    expect(brief(reduceMia(m, { t: 'miss', stage: st, idx: 0 }))).toEqual([])
  })
})

describe('экзамен: очередь речи играет пачку по порядку', () => {
  function rig() {
    let t = 0, id = 0, busy = 0
    const timers = new Map(), log = []
    const setTimer = (fn, ms) => { const k = ++id; timers.set(k, { fn, at: t + ms }); return k }
    const clearTimer = k => timers.delete(k)
    const advance = ms => { const end = t + ms; for (;;) { const next = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break; t = next[1].at; timers.delete(next[0]); next[1].fn() } t = end }
    const cat = { busyLeft: () => Math.max(0, busy - t), holdBusy: ms => { busy = Math.max(busy, t + ms) }, sayLine: vi.fn((i, v, o) => { if (t < busy) return false; log.push(`${t} пит: ${i}`); busy = t + 1000; setTimer(() => o.onEnd(), 1000); return true }) }
    const sayText = vi.fn((text, o) => { log.push(`${t} пит-слово: ${text}${o.ru ? ' (ru)' : ''}`); busy = t + 900; o.onSay?.(900); setTimer(() => o.onEnd?.(), 900) })
    const lines = { boss_mia_miss_2: { text: 'Слово ушло', url: null }, boss_help_1: { text: 'это значит', url: 'h', duration: 1 }, boss_pit_next: { text: 'Следующее слово', url: null } }
    const sp = createMiaSpeech({ now: () => t, setTimer, clearTimer, onCaption: () => {}, log: () => {}, trace: (k, p) => { if (k === 'line-start') log.push(`${t} мия: ${p.id}`) } })
    sp.use({ lines, cat, sayText, listener: { current: { mute: () => {} } } })
    return { sp, advance, log }
  }
  it('Мия → «это значит» + слово → «следующее слово»; очередь занята до самого конца (пилюля ждёт)', () => {
    const r = rig(), st = exam()
    r.sp.enqueue(reduceMia(start(st), { t: 'fail', stage: st, idx: 0 }).say)
    r.advance(200); expect(r.sp.leftMs()).toBeGreaterThan(3000)
    r.advance(12000)
    expect(r.log.map(s => s.replace(/^\d+ /, ''))).toEqual(['мия: boss_mia_miss_2', 'пит: boss_help_1', 'пит-слово: meet', 'пит: boss_pit_next'])
    const at = r.log.map(s => Number(s.split(' ')[0])); expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(r.sp.pending()).toBe(0); expect(r.sp.leftMs()).toBe(0)
  })
})

describe('конец экзамена: Мия не «уходит», Пит не просится наружу', () => {
  const finish = (act, evs = []) => {
    const round = act === 'boss' ? exam() : { mia: 'round', act, sid: `${act}3`, words: W }
    let m = reduceMia({ ...miaInit(), phase: 'in', act }, { t: 'enter', stage: round }).mia
    for (const e of evs) m = reduceMia(m, { ...e, stage: round }).mia
    return reduceMia(m, { t: 'enter', stage: { mia: 'end', act, sid: `${act}-end`, ms: 18000 }, now: 1000, keepMs: 4000 })
  }
  it('экзамен с неверным словом: Мия остаётся на коробке и говорит вердикт без «а я пошла»; режим «коробку снимает ученик» не включается', () => {
    const r = finish('boss', [{ t: 'win', idx: 0 }, { t: 'fail', idx: 1 }])
    expect(r.say.map(c => c.id)).toEqual(['boss_mia_stay', 'boss_pit_keep'])
    expect(miaLine('boss_mia_stay')).toMatchObject({ who: 'mia' }); expect(miaLine('boss_mia_stay').text).not.toMatch(/пошла|ушла|ухожу/)
    expect(r.mia).toMatchObject({ phase: 'in', keep: true }); expect(r.mia.solo).toBeFalsy()
    for (const t of ['try', 'stuck', 'faster', 'free']) { const x = reduceMia(r.mia, { t, now: 2000 }); expect(x.say).toEqual([]); expect(x.mia).toBe(r.mia) }
    expect(reduceMia(r.mia, { t: 'enter', stage: { type: 'summary' }, now: 3000 }).mia).toBe(r.mia) // под итогом Мия и коробка стоят как есть
  })
  it('экзамен без ошибок: Мия говорит обе реплики и уходит с коробкой ПОСЛЕ «Коробка мне ещё пригодится, пока» (событие bye — реальный конец её звука), и только потом Пит (было: уход сразу при входе на стадию-конец, Пит по таймеру 2,8 с)', () => {
    const r = finish('boss', [0, 1, 2].map(idx => ({ t: 'win', idx })))
    expect(r.say.map(c => c.id)).toEqual(['boss_mia_free', 'boss_mia_bye']); expect(r.mia).toMatchObject({ phase: 'in', bye: 'boss_mia_bye', outcome: 'free' })
    expect(reduceMia(r.mia, { t: 'bye', id: 'boss_mia_free', now: 2000 }).mia).toBe(r.mia) // «вот твои трофеи» договорена — ещё не уходит
    const g = reduceMia(r.mia, { t: 'bye', id: 'boss_mia_bye', now: 3000 }); expect(g.mia).toMatchObject({ phase: 'out', why: 'end', at: 3000 }); expect(g.say.map(c => [c.who, c.id])).toEqual([['pit', 'boss_pit_well']]); expect(g.say[0].delay).toBeLessThanOrEqual(1300) // Пит — когда Мия уже за краем, не позже конца анимации ухода
  })
  it('«Допрос у Мии» — как раньше: «…а я пошла», Мия выпрыгивает одна, Пит просит помочь, коробку снимает ученик', () => {
    const r = finish('catch', [{ t: 'win', idx: 0 }, { t: 'fail', idx: 1 }])
    expect(r.say.map(c => c.id)).toEqual(['boss_mia_keep']); expect(r.mia).toMatchObject({ phase: 'in', solo: 'keep' })
    expect(reduceMia(r.mia, { t: 'try', now: 1 }).say.map(c => c.id)).toEqual(['boss_pit_try'])
    const s = reduceMia(r.mia, { t: 'stuck', now: 2 }); expect(s.say.map(c => c.id)).toEqual(['boss_pit_stuck'])
    expect(reduceMia(s.mia, { t: 'free', now: 3 }).mia).toMatchObject({ phase: 'out', alone: true })
  })
  it('стадия-конец экзамена держится, пока Мия говорит вердикт (итог не выезжает поверх её реплики); «Допрос» ждёт снятия коробки, как раньше', () => {
    const sp = { msOf: id => (id === 'boss_mia_stay' ? 3000 : 1000) }
    const boss = finish('boss', [{ t: 'fail', idx: 0 }]).mia, cat = finish('catch', [{ t: 'fail', idx: 0 }]).mia
    expect(endHoldMs({ act: 'boss', mia: 'end', ms: 18000, preWait: 500 }, { m: boss }, sp)).toBeGreaterThanOrEqual(3500)
    expect(endHoldMs({ act: 'boss', mia: 'end', ms: 18000 }, { m: boss }, sp)).toBeLessThanOrEqual(18000)
    expect(endHoldMs({ act: 'catch', mia: 'end', ms: 18000, preWait: 500 }, { m: cat }, sp)).toBe(1100)
  })
  it('А. снятия коробки касанием в экзамене нет ни в одном исходе (владелец 2026-11-22; исходов с 2026-11-24 три — по доле трофеев): успех — Мия убегает ВМЕСТЕ с коробкой, даже если в этой игре коробку уже снимали касаниями в «Допросе»; провал — Мия и коробка остаются; снятия коробки касанием в экзамене нет никогда', () => {
    const after = { ...miaInit(), phase: 'out', act: 'catch', alone: true, solo: 'stuck', used: { catch: true } } // след «Допроса»: коробку сняли (alone) или не дождались (solo)
    const ann = reduceMia(after, { t: 'enter', stage: { mia: 'ann', act: 'boss', script: 'boss' }, now: 0 }).mia
    expect(ann).toMatchObject({ phase: 'in', act: 'boss', alone: false, solo: null })
    const run = evs => { const st = exam(); let m = reduceMia(ann, { t: 'enter', stage: st }).mia; for (const e of evs) m = reduceMia(m, { ...e, stage: st }).mia; return reduceMia(m, { t: 'enter', stage: { mia: 'end', act: 'boss', ms: 18000 }, now: 1000 }) }
    const ok0 = run([0, 1, 2].map(idx => ({ t: 'win', idx }))), ok = reduceMia(ok0.mia, { t: 'bye', id: 'boss_mia_bye', now: 2000 }) // уход — после её последней реплики
    expect(ok.mia).toMatchObject({ phase: 'out', why: 'end', alone: false, solo: null, keep: false }) // alone: false — на картинке коробка улетает с Мией (RaceMia: без Мии только при alone)
    const bad = run([{ t: 'fail', idx: 0 }])
    expect(bad.mia).toMatchObject({ phase: 'in', keep: true, alone: false, solo: null })
    for (const m of [ok.mia, bad.mia, { ...bad.mia, solo: 'keep' }, { ...bad.mia, solo: 'stuck' }]) for (const t of ['try', 'stuck', 'faster', 'free']) { const x = reduceMia(m, { t, now: 5 }); expect(x.say).toEqual([]); expect(x.mia).toBe(m) } // даже с чужой отметкой solo экзамен коробку не отдаёт
  })
  it('Б. провал: после вердикта Мии Пит из коробки говорит, что ждёт завтра, чтобы ему помогли выбраться; стадия-конец ждёт обе реплики (итог не выезжает поверх)', () => {
    const r = finish('boss', [{ t: 'fail', idx: 0 }])
    expect(r.say.map(c => [c.who, c.id])).toEqual([['mia', 'boss_mia_stay'], ['pit', 'boss_pit_keep']])
    expect(miaLine('boss_pit_keep').text).toMatch(/завтра/); expect(miaLine('boss_pit_keep').text).toMatch(/жду/) // правка владельца 2026-11-24: «Я видел, как ты стараешься, у тебя неплохо получается, жду тебя завтра» (просьбы вытащить больше нет)
    const sp = { msOf: (id, who) => (id === 'boss_mia_stay' ? 3000 : id === 'boss_pit_keep' && who === 'pit' ? 5000 : 1000) }
    expect(endHoldMs({ act: 'boss', mia: 'end', ms: 18000, preWait: 500 }, { m: r.mia }, sp)).toBeGreaterThanOrEqual(500 + 3000 + 5000)
    expect(finish('boss', [0, 1, 2].map(idx => ({ t: 'win', idx }))).say.map(c => c.id)).not.toContain('boss_pit_keep')
  })
  it('В. слово сразу после «Следующее слово»: пилюля, перед которой оно прозвучало, не ждёт выезда наполовину (слово — в миг выезда); первое слово блока и слово после верного ответа — как раньше (v3.3.270)', async () => {
    const { applyMia, makeMiaBox } = await import('./raceMia.js'); const { leadAfter, bossLeadMs } = await import('../boss/bossLead.js')
    const st = exam(), mb = makeMiaBox(); mb.m = start(st)
    expect(leadAfter(mb, 'boss', 0.5)).toBe(bossLeadMs('boss', 0.5)); expect(bossLeadMs('boss', 0.5)).toBeGreaterThan(800) // первое слово блока
    applyMia(mb, reduceMia(mb.m, { t: 'win', stage: st, idx: 0 }), st)
    expect(leadAfter(mb, 'boss', 0.5)).toBe(bossLeadMs('boss', 0.5)) // после верного ответа
    applyMia(mb, reduceMia(mb.m, { t: 'fail', stage: st, idx: 1 }), st)
    expect(leadAfter(mb, 'boss', 0.5)).toBe(0); expect(leadAfter(mb, 'boss', 0.5)).toBe(bossLeadMs('boss', 0.5)) // одна пилюля — потом снова как раньше
    applyMia(mb, reduceMia(mb.m, { t: 'fail', stage: st, idx: 2 }), st) // последнее слово блока: «следующее слово» не звучало
    expect(leadAfter(mb, 'boss', 0.5)).toBe(bossLeadMs('boss', 0.5))
    expect(readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')).toContain('lead.run(leadAfter(mb, act, rep?.speed)')
  })
  it('директор: верное слово Пит говорит через очередь речи Мии (после колкости), а не сам сразу', () => {
    const src = readFileSync(new URL('../useRaceActs.js', import.meta.url), 'utf8')
    expect(src).not.toContain('sayCorrect'); expect(src).toContain('mspeech.use({ lines, cat: args.cat, listener: listenerRef, sayText })')
  })
})
