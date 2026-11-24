import { describe, it, expect } from 'vitest'
import { reduceMia, miaInit, BOSS, endKeep, miaStays } from '../mia/raceMia.js'
import { miaLine, MIA_LINE_IDS } from '../mia/miaLines.js'
import { LEAVE } from '../mia/miaMotion.js'
import { examOf, missWhy, MISS_LINE, BYE_LINE, PIT_AFTER_LEAVE_MS, ceremonyTimes, AFTER_HUSH_MS, JUMP_TO_LOOK_MS, markClaimed, markAsked, spokeSince } from './bossMia.js'
import { HELP_LINES } from './bossHelp.js'

// Экзамен «Шкала памяти» по сценарию владельца 2026-11-24: колкость Мии — по ПРИЧИНЕ, три исхода по доле трофеев, порядок реплик и действий в каждой концовке.
const W = ['a', 'b', 'c', 'd', 'e', 'f'].map(text => ({ text, translation: `${text}-ру` }))
const round = { mia: 'round', silent: true, act: 'boss', sid: 'boss', words: W, step: {} }, end = { mia: 'end', act: 'boss', sid: 'boss-end', ms: 1200 }
const start = () => reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage: round }).mia
const play = evs => { let m = start(); for (const e of evs) m = reduceMia(m, { stage: round, ...e }).mia; return m }
const answer = (idx, zone) => [{ t: 'zone', zone, idx }, { t: 'win', idx }] // как в игре: шкала шлёт зону в кадре принятия, зачёт (win) — следом
const finish = evs => reduceMia(play(evs), { t: 'enter', stage: end, now: 1000 })
const ids = r => r.say.map(c => c.id)

describe('колкость Мии в круге экзамена — по причине, а не по кругу', () => {
  it('чужое слово (было событие miss на этом слове) — «Мимо, трофеи за это слово мои»', () => {
    const m = play([{ t: 'miss', idx: 0 }]), r = reduceMia(m, { t: 'fail', stage: round, idx: 0, spoke: true })
    expect(ids(r)[0]).toBe('boss_mia_miss_1'); expect(miaLine('boss_mia_miss_1').text).toMatch(/^Мимо/)
  })
  it('говорили, но не успели — «Слово ушло, трофеи тоже»; причины нет в событии — она же', () => {
    expect(ids(reduceMia(start(), { t: 'fail', stage: round, idx: 0, spoke: true }))[0]).toBe('boss_mia_miss_2')
    expect(ids(reduceMia(start(), { t: 'fail', stage: round, idx: 0 }))[0]).toBe('boss_mia_miss_2'); expect(miaLine('boss_mia_miss_2').text).toMatch(/^Слово ушло/)
  })
  it('молчали — «Забыли слово, трофеи заберу я»', () => {
    expect(ids(reduceMia(start(), { t: 'fail', stage: round, idx: 0, spoke: false }))[0]).toBe('boss_mia_miss_3'); expect(miaLine('boss_mia_miss_3').text).toMatch(/^Забыли/)
  })
  it('одна и та же причина подряд — одна и та же реплика (случайности и чередования нет); порядок круга не менялся: Мия → Пит «это значит» + слово → Пит «Следующее слово»', () => {
    let m = start(); const seen = []
    for (const idx of [0, 1, 2]) { const r = reduceMia(m, { t: 'fail', stage: round, idx, spoke: false }); seen.push(ids(r)); m = r.mia }
    expect(seen.map(s => s[0])).toEqual(['boss_mia_miss_3', 'boss_mia_miss_3', 'boss_mia_miss_3'])
    expect(seen.map(s => s.slice(1))).toEqual([[HELP_LINES[0], 'boss_pit_next'], [HELP_LINES[1], 'boss_pit_next'], [HELP_LINES[2], 'boss_pit_next']])
    expect(MISS_LINE).toEqual({ wrong: 'boss_mia_miss_1', late: 'boss_mia_miss_2', forgot: 'boss_mia_miss_3' })
    expect(missWhy({ failed: { 2: true } }, 2, { spoke: false })).toBe('wrong') // неверное слово важнее молчания после него
  })
  it('директор: «говорили ли» — по отметке слушателя с момента, когда Пит назвал слово', () => {
    const mb = {}; markAsked(mb, 5000); markClaimed(mb, 3)
    expect(mb).toEqual({ askAt: 5000, zi: 3 }); expect(spokeSince(mb, 5200)).toBe(true); expect(spokeSince(mb, 4000)).toBe(false); expect(spokeSince(mb, 0)).toBe(false); expect(spokeSince(mb, undefined)).toBe(false)
  })
})

describe('счёт трофеев в машине', () => {
  it('зона слова приходит с номером слова (в любом порядке с зачётом); верный ответ без зоны — зелёная', () => {
    expect(examOf(play([...answer(0, 'mid')]))).toMatchObject({ got: 10, lost: 10 })
    expect(examOf(play([{ t: 'win', idx: 1 }, { t: 'zone', zone: 'slow', idx: 1 }]))).toMatchObject({ got: 3, lost: 17 }) // зона пришла после зачёта (медленный кадр)
    expect(examOf(play([{ t: 'win', idx: 2 }]))).toMatchObject({ got: 20, lost: 0 })
  })
  it('ошибка на слове трофеев не отнимает, пока пилюля едет (можно поправиться); слово ушло — все его трофеи у Мии', () => {
    expect(examOf(play([{ t: 'miss', idx: 0 }]))).toMatchObject({ got: 0, lost: 0 })
    expect(examOf(play([{ t: 'miss', idx: 0 }, ...answer(0, 'fast')]))).toMatchObject({ got: 20, lost: 0 })
    expect(examOf(play([{ t: 'fail', idx: 0 }]))).toMatchObject({ got: 0, lost: 20 })
  })
  it('второй блок (русские слова) продолжает счёт первого; новая игра начинает с нуля', () => {
    const b2 = { ...round, sid: 'boss2', offset: 3, words: W.slice(3), step: { lang: 'ru' } }
    let m = play([...answer(0, 'fast'), { t: 'fail', idx: 1 }, ...answer(2, 'mid')]); m = reduceMia(m, { t: 'enter', stage: b2 }).mia
    expect(examOf(m)).toMatchObject({ got: 30, lost: 30, max: 120 })
    m = reduceMia(m, { t: 'zone', zone: 'slow', idx: 0, stage: b2 }).mia; m = reduceMia(m, { t: 'win', idx: 0, stage: b2 }).mia
    expect(m.zones).toMatchObject({ 0: 'fast', 2: 'mid', 3: 'slow' }); expect(examOf(m)).toMatchObject({ got: 33, lost: 47 })
    const again = reduceMia(m, { t: 'enter', stage: { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true, script: 'boss' }, now: 0 }).mia // церемония заново (новая попытка экзамена)
    expect(examOf(reduceMia(again, { t: 'enter', stage: round }).mia)).toMatchObject({ got: 0, lost: 0, max: 120 }); expect(reduceMia(again, { t: 'enter', stage: round }).mia.zones).toEqual({})
  })
})

describe('три концовки: порядок реплик и действий', () => {
  const all = zs => zs.flatMap((z, i) => (z ? answer(i, z) : [{ t: 'fail', idx: i }]))
  it('успех (≥ 70 %): Мия «вот твои трофеи» → Мия «Коробка мне ещё пригодится, пока» → Мия уходит с коробкой → только потом Пит', () => {
    const r = finish(all(['fast', 'fast', 'mid', 'fast', 'fast', 'mid']))
    expect(r.say.map(c => [c.who, c.id])).toEqual([['mia', 'boss_mia_free'], ['mia', 'boss_mia_bye']]) // Пита в этой пачке нет: он ждёт ухода
    expect(r.mia).toMatchObject({ phase: 'in', keep: false, outcome: 'free', bye: 'boss_mia_bye' }) // Мия ещё на коробке: уход не начинается при входе на стадию-конец
    expect(reduceMia(r.mia, { t: 'bye', id: 'boss_mia_free', now: 3000 }).mia).toBe(r.mia) // конец первой реплики уход не запускает
    const g = reduceMia(r.mia, { t: 'bye', id: 'boss_mia_bye', now: 5000 })
    expect(g.mia).toMatchObject({ phase: 'out', why: 'end', at: 5000, bye: null, alone: false }); expect(g.say).toEqual([{ id: 'boss_pit_well', who: 'pit', delay: PIT_AFTER_LEAVE_MS }])
    expect(PIT_AFTER_LEAVE_MS).toBeGreaterThanOrEqual(LEAVE.JUMP * 1000); expect(PIT_AFTER_LEAVE_MS).toBeLessThanOrEqual(LEAVE.END * 1000) // Пит — когда Мия уже за краем, не дожидаясь конца анимации
    expect(reduceMia(g.mia, { t: 'bye', id: 'boss_mia_bye', now: 6000 }).mia).toBe(g.mia) // второй раз не уходит
    expect(endKeep(r.mia, end)).toBe(false); expect(miaStays({ m: g.mia })).toBe(false)
  })
  it('средний (40–69 %): Мия «Пит свободен, но потерянные трофеи я оставлю себе» → уходит с коробкой → Пит', () => {
    const r = finish(all(['fast', 'fast', 'mid', 'slow', null, null]))
    expect(r.say.map(c => [c.who, c.id])).toEqual([['mia', 'boss_mia_mid']]); expect(r.mia).toMatchObject({ phase: 'in', keep: false, outcome: 'mid', bye: 'boss_mia_mid' })
    expect(r.log).toContain('трофеи 53 из 120 (44 %), у Мии 67'); expect(r.log).toContain('потерянное Мия оставляет себе')
    const g = reduceMia(r.mia, { t: 'bye', id: 'boss_mia_mid', now: 4000 }); expect(g.mia.phase).toBe('out'); expect(ids(g)).toEqual(['boss_pit_well'])
    expect(MIA_LINE_IDS).toContain('boss_mia_mid'); expect(miaLine('boss_mia_mid')).toMatchObject({ who: 'mia', text: 'Пит свободен, но потерянные трофеи я оставлю себе' }); expect(BYE_LINE).toEqual({ free: 'boss_mia_bye', mid: 'boss_mia_mid' })
  })
  it('провал (< 40 %): Мия вердикт → Пит «жду тебя завтра»; Мия и коробка остаются (ухода нет, под итогом стоят как есть)', () => {
    const r = finish(all(['mid', null, null, 'slow', null, null]))
    expect(r.say.map(c => [c.who, c.id])).toEqual([['mia', 'boss_mia_stay'], ['pit', 'boss_pit_keep']]); expect(r.mia).toMatchObject({ phase: 'in', keep: true, outcome: 'stay', bye: null })
    expect(reduceMia(r.mia, { t: 'bye', id: 'boss_mia_stay', now: 4000 }).mia).toBe(r.mia) // конец её реплики ничего не запускает
    expect(reduceMia(r.mia, { t: 'enter', stage: { type: 'summary' }, now: 9000 }).mia).toBe(r.mia); expect(endKeep(r.mia, end)).toBe(true); expect(miaStays({ m: r.mia })).toBe(true)
  })
  it('пауза на стадии-конце и «Продолжить»: исход объявляется заново; экзамен покинут до ухода Мии — она уходит молча, без реплик «Допроса»', () => {
    const r = finish(all(['fast', 'fast', 'fast', 'fast', 'fast', 'fast']))
    expect(ids(reduceMia(r.mia, { t: 'enter', stage: end, now: 2000 }))).toEqual(['boss_mia_free', 'boss_mia_bye'])
    const out = reduceMia(r.mia, { t: 'enter', stage: { type: 'summary' }, now: 3000 }); expect(out.mia.phase).toBe('out'); expect(out.say).toEqual([])
  })
  it('реплика Мии «…все трофеи заберу я» оставлена как у владельца (противоречие с правилами снято его решением)', () => {
    expect(miaLine('boss_mia_five').text).toBe('Ошибётесь хоть в одном слове, Пит останется в коробке, а все трофеи заберу я')
  })
})

describe('церемония: прыжок Мии и объяснение шкалы — от реального конца её реплики из-за края', () => {
  const base = { hushAt: 5000, jumpAbs: 6700, lookAt: 7800 }
  it('длина реплики известна: прыжок сразу после неё, объяснение — после посадки; длиннее реплика — позже оба срока', () => {
    expect(ceremonyTimes(base, 2600)).toEqual({ jumpAbs: 5000 + 2600 + AFTER_HUSH_MS, lookAt: 5000 + 2600 + AFTER_HUSH_MS + JUMP_TO_LOOK_MS })
    expect(ceremonyTimes(base, 1200).jumpAbs).toBeLessThan(ceremonyTimes(base, 2600).jumpAbs); expect(ceremonyTimes(base, 1200).jumpAbs).toBeGreaterThanOrEqual(5000 + 1200) // Мия не прыгает посреди реплики «из-за края»
  })
  it('длины нет — прежние метки', () => { expect(ceremonyTimes(base, 0)).toEqual({ jumpAbs: 6700, lookAt: 7800 }) })
  it('машина ставит объяснение на переданный срок; без него — как раньше (BOSS.LOOK_AT)', () => {
    const ann = { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true, script: 'boss', dropAt: BOSS.DROP_AT, jumpAt: BOSS.JUMP }
    const at = r => Object.fromEntries(r.say.map(c => [c.id, c.delay]))
    expect(at(reduceMia(miaInit(), { t: 'enter', stage: ann, now: 0 })).boss_mia_look).toBe(BOSS.LOOK_AT)
    const t = at(reduceMia(miaInit(), { t: 'enter', stage: ann, now: 0, bossLookAt: 12345 }))
    for (const id of ['boss_mia_look', 'boss_mia_green', 'boss_mia_yellow', 'boss_mia_red', 'boss_mia_five', 'boss_pit_no', 'boss_mia_go']) expect(t[id]).toBe(12345)
    expect(t.boss_mia_hush).toBe(BOSS.HUSH_AT)
  })
})
