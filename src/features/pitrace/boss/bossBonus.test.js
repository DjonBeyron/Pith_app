import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { bonusRoute, bonusWords, bonusOrder, bonusSteps, bonusTarget, windowMs, minWindowMs, kMax, BONUS_ANN_SID, BONUS_SID, BONUS_LINE, BONUS_LAST, BONUS_K_FIRST, BONUS_K_LAST_FROM, BONUS_MIN } from './bossBonus.js'
import { examPerfect, examOf, bonusOf } from './bossMia.js'
import { examWordLine } from './examLog.js'
import { bossFill, BOSS_SPEED } from './bossWords.js'
import { reduceMia, miaInit } from '../mia/raceMia.js'
import { miaLine } from '../mia/miaLines.js'
import { buildRaceStages } from '../raceStages.js'
import { initRace } from '../raceState.js'
import { createSwitcher } from '../raceSwitch.js'
import { createStudentGame, stepStudent, isClaimable } from '../../player/modules/rotate-phone/wordLaneStudent.js'
import { fixturePlan } from '../../rehearsal/rehearsalFixtures.js'
import { normalizePlan } from '../../rehearsal/rehearsalPlan.js'

// Бонус-круг экзамена (владелец 2026-11-26): «если пользователь всё ответил верно и в зелёной зоне, Мия говорит: раз для тебя это просто, я ускоряю игру, и все слова идут снова в рандомном
// порядке на этом же языке детекции и с ускорением, где последние три слова прям реально быстро идут, чтобы система могла успеть это считать».
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8')
const plan = normalizePlan({ ...fixturePlan('three'), source: 'node', game: 'race', round: 'stages' })
const game = (ru = true) => { const stages = buildRaceStages({ plan, tap: false, ru }).stages; bossFill(stages, initRace(), plan.seed); return stages }
const sidAt = (stages, sid) => stages.findIndex(x => x.sid === sid)
const blocksOf = stages => stages.filter(x => x.act === 'boss' && x.mia === 'round' && !x.bonus)
/** Экзамен до конца на машине Мии: zone(n) — зона n-го слова по общему счёту, или 'fail' — слово не названо */
function exam(stages, zone = () => 'fast') {
  let m = reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage: blocksOf(stages)[0] }).mia, n = 0
  for (const stage of blocksOf(stages)) {
    m = reduceMia(m, { t: 'enter', stage }).mia
    stage.words.forEach((_, idx) => { const z = zone(n++); if (z === 'fail') { m = reduceMia(m, { t: 'fail', stage, idx, spoke: false }).mia; return } m = reduceMia(m, { t: 'zone', zone: z, idx, stage }).mia; m = reduceMia(m, { t: 'win', idx, stage }).mia })
  }
  return m
}
const route = (stages, m) => bonusRoute(stages, sidAt(stages, BONUS_ANN_SID), m, plan.seed)

describe('условие входа: все слова верны и каждое в зелёной зоне', () => {
  it('всё верно и зелёное — директор идёт на реплику Мии; одно жёлтое или одна ошибка — сразу на концовку, как раньше', () => {
    const st = game(), ann = sidAt(st, BONUS_ANN_SID), end = sidAt(st, 'boss-end')
    expect(examPerfect(exam(st))).toBe(true); expect(route(st, exam(st)).idx).toBe(ann)
    const yellow = exam(game(), n => (n === 2 ? 'mid' : 'fast')), st2 = game()
    expect(examPerfect(yellow)).toBe(false); expect(route(st2, yellow)).toMatchObject({ idx: end }); expect(route(game(), yellow).log).toMatch(/бонус-круга нет: верно названо 6 из 6, из них в зелёной зоне 5/)
    const miss = exam(game(), n => (n === 5 ? 'fail' : 'fast'))
    expect(examPerfect(miss)).toBe(false); expect(route(game(), miss).idx).toBe(end)
    expect(examPerfect(exam(game(), n => (n === 0 ? 'slow' : 'fast')))).toBe(false)
  })
  it('верный ответ без зоны (принят раньше, чем пилюля коснулась шкалы) — зелёный, как в трофеях; экзамена не было — условия нет', () => {
    const st = game(); let m = reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage: blocksOf(st)[0] }).mia
    for (const stage of blocksOf(st)) { m = reduceMia(m, { t: 'enter', stage }).mia; stage.words.forEach((_, idx) => { m = reduceMia(m, { t: 'win', idx, stage }).mia }) }
    expect(examPerfect(m)).toBe(true); expect(examOf(m, true)).toMatchObject({ got: 120, max: 120 })
    expect(examPerfect(miaInit())).toBe(false); expect(examPerfect({ ...m, act: 'sprint' })).toBe(false)
  })
  it('пока экзамен идёт (директор заглядывает вперёд за дорожками), маршрут молча ведёт мимо бонуса и ничего не вписывает; решение считается заново на каждый вызов', () => {
    const st = game(), ann = sidAt(st, BONUS_ANN_SID), half = reduceMia(reduceMia({ ...miaInit(), phase: 'in', act: 'boss' }, { t: 'enter', stage: blocksOf(st)[0] }).mia, { t: 'win', idx: 0, stage: blocksOf(st)[0] }).mia
    expect(route(st, half)).toEqual({ idx: sidAt(st, 'boss-end'), log: null }); expect(st[ann].bonusKey).toBeUndefined()
    const block1 = exam([st[sidAt(st, 'boss')]]); expect(block1.total).toBe(3); expect(examPerfect(block1)).toBe(true); expect(route(st, block1)).toEqual({ idx: sidAt(st, 'boss-end'), log: null }) // первый блок сыгран идеально, второй ещё не начат — решать рано
    const first = route(st, exam(st)); expect(first.log).toMatch(/^\[exam\] бонус-круг: все 6 слов названы верно и в зелёной зоне/)
    const step = st[ann + 1].step; expect(route(st, exam(st))).toEqual({ idx: ann, log: null }); expect(st[ann + 1].step).toBe(step) // повторный вызов слова не переписывает и в журнал не пишет
    expect(bonusRoute(st, sidAt(st, 'boss'), exam(st), plan.seed)).toEqual({ idx: sidAt(st, 'boss'), log: null }) // чужую стадию маршрут не трогает
  })
  it('экзамена нет (мало слов) — стадий бонуса тоже нет: они пусты вместе с экзаменом', () => {
    const st = buildRaceStages({ plan, tap: false, ru: true }).stages
    st.find(x => x.sid === 'boss').base = st.find(x => x.sid === 'boss').base.slice(0, 2); bossFill(st, initRace(), plan.seed)
    expect(st.filter(x => x.bonus).map(x => x.empty)).toEqual([true, true])
    expect(buildRaceStages({ plan, tap: true, ru: true }).stages.some(x => x.bonus)).toBe(false) // «Пальцами» экзамена нет
  })
})

describe('слова бонус-круга: все слова экзамена заново, порядок случайный по семени', () => {
  const W = ['one', 'two', 'three', 'four', 'five', 'six'].map((text, i) => ({ text, translation: ['один', 'два', 'три', 'четыре', 'пять', 'шесть'][i] }))
  it('каждое слово по одному разу; порядок не как в экзамене; первое слово бонуса — не последнее слово экзамена; одно семя — один порядок', () => {
    for (const seed of ['a', 'b', 'c', 'r1', '2026-11-26|x', 7, 8, 9, 10, 11, 12, 13]) {
      for (const n of [3, 4, 5, 6]) {
        const words = W.slice(0, n), list = bonusOrder(words, seed)
        expect([...list].sort((a, b) => a.text.localeCompare(b.text))).toEqual([...words].sort((a, b) => a.text.localeCompare(b.text)))
        expect(list.map(w => w.text)).not.toEqual(words.map(w => w.text)); expect(list[0]).not.toBe(words.at(-1))
        expect(bonusOrder(words, seed)).toEqual(list)
      }
    }
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(seed => bonusOrder(W, seed).map(w => w.text).join())).size).toBeGreaterThan(2) // разные семена — разные порядки
  })
  it('в игре: в круг вписаны все шесть слов экзамена (оба блока), на одной дорожке по центру, номера подряд', () => {
    const st = game(); route(st, exam(st)); const round = st[sidAt(st, BONUS_SID)], all = blocksOf(st).flatMap(x => x.words.map(w => w.text))
    expect(round.words.map(w => w.text).sort()).toEqual([...all].sort()); expect(round.words.map(w => w.text)).not.toEqual(all); expect(round.words[0].text).not.toBe(all.at(-1))
    expect(round.words.map(w => w.idx)).toEqual([0, 1, 2, 3, 4, 5]); expect(round.step.reps.every(r => r.lane === 1)).toBe(true); expect(round.step).toMatchObject({ wide: true, overlap: false, maxTries: 1 })
  })
})

describe('язык бонус-круга — язык последнего блока экзамена, модель слуха не переключается', () => {
  it('последний блок русский: на пилюле английское слово, отвечать по-русски — и для слов первого (английского) блока', () => {
    const st = game(); route(st, exam(st)); const round = st[sidAt(st, BONUS_SID)], ann = st[sidAt(st, BONUS_ANN_SID)]
    expect(round.step.lang).toBe('ru'); expect(round.step.chunks).toEqual(round.words.map(w => w.translation)); expect(round.step.reps.map(r => r.cap)).toEqual(round.words.map(w => w.text))
    expect(blocksOf(st)[0].step.lang).toBeUndefined(); expect(blocksOf(st)[0].words.every(w => round.words.some(x => x.text === w.text))).toBe(true)
    expect(ann.switchTo).toBe('ru') // стадия-реплика «держит» русский слух: useRaceSwitch не возвращает английскую модель
    expect(st.slice(sidAt(st, 'boss2') + 1, sidAt(st, BONUS_SID)).filter(x => x.switchTo && x.switchTo !== 'ru')).toEqual([])
  })
  it('switchTo «ru» при уже русском слухе ничего не выгружает и не грузит (рывка смены модели нет)', async () => {
    const log = [], rt = name => ({ evict: () => log.push(`${name}.evict`), acquire: () => { log.push(`${name}.acquire`); return () => {} }, whenSettled: async () => ({ ok: true }), expect: () => {}, warmNow: () => log.push(`${name}.warm`) })
    const sw = createSwitcher({ en: rt('en'), ru: rt('ru'), setTimer: fn => { fn(); return 0 } })
    await sw.toRu(); const before = log.length; expect(sw.state()).toBe('ru')
    expect(await sw.toRu()).toEqual({ ok: true }); expect(log.length).toBe(before); expect(sw.pendingMs()).toBe(0)
  })
  it('русской модели нет (или она не включилась — блок переведён на английский): бонус английский, на пилюле перевод, стадия-реплика слух не трогает', () => {
    const en = game(false); route(en, exam(en)); const round = en[sidAt(en, BONUS_SID)]
    expect(round.step.lang).toBeUndefined(); expect(round.step.chunks).toEqual(round.words.map(w => w.text)); expect(round.step.reps.map(r => r.cap)).toEqual(round.words.map(w => w.translation)); expect(en[sidAt(en, BONUS_ANN_SID)].switchTo).toBeUndefined()
    const st = game(); st.find(x => x.sid === 'boss2').demote(); route(st, exam(st))
    expect(st[sidAt(st, BONUS_SID)].step.lang).toBeUndefined(); expect(st[sidAt(st, BONUS_ANN_SID)].switchTo).toBeUndefined()
  })
  it('слово, которое на этом языке спросить нельзя (нет русского перевода), в бонус не идёт; слов осталось меньше трёх — бонуса нет', () => {
    const W = [{ text: 'cat', translation: 'кот' }, { text: 'ok', translation: 'ok' }, { text: 'dog', translation: 'собака' }, { text: 'sun', translation: '' }, { text: 'tea', translation: 'чай' }]
    expect(bonusTarget(W[1], true)).toBe(''); expect(bonusTarget(W[1], false)).toBe('ok'); expect(bonusTarget(W[0], true)).toBe('кот')
    const { list, skipped } = bonusWords(W, true, 's'); expect(list.map(w => w.text).sort()).toEqual(['cat', 'dog', 'tea']); expect(skipped.map(w => w.text)).toEqual(['ok', 'sun'])
    expect(bonusWords(W, false, 's').skipped).toEqual([])
    const st = game(); for (const b of blocksOf(st)) b.words.slice(1).forEach(w => { w.translation = '' })
    expect(BONUS_MIN).toBe(3); const r = route(st, exam(st)); expect(r.idx).toBe(sidAt(st, 'boss-end')); expect(r.log).toMatch(/можно спросить только 2 слов/)
  })
})

describe('скорость: ступенями, последние три — резко быстрее, но не быстрее, чем слово можно сказать и распознать', () => {
  it('ступени: каждое слово быстрее предыдущего; последние три — самые быстрые и идут скачком от разгона', () => {
    expect(bonusSteps(6)).toEqual([1.3, 1.6, 1.9, 2.8, 3.3, 3.8]); expect(bonusSteps(3)).toEqual([2.8, 3.3, 3.8]); expect(bonusSteps(4)).toEqual([1.3, 2.8, 3.3, 3.8])
    expect(bonusSteps(9)).toEqual([1.3, 1.51, 1.73, 1.94, 2.16, 2.37, 2.8, 3.3, 3.8]) // слов больше обычного (экзамен — не больше шести): разгон делится ровно и не доходит до последних трёх
    for (const n of [3, 4, 5, 6, 7, 9, 12]) { const k = bonusSteps(n); expect(k.every((x, i) => i === 0 || x > k[i - 1])).toBe(true); expect(k.slice(-BONUS_LAST)[0]).toBe(BONUS_K_LAST_FROM); expect(Math.max(...k.slice(0, -BONUS_LAST), 0)).toBeLessThan(BONUS_K_LAST_FROM) }
    expect(BONUS_K_FIRST).toBeGreaterThan(1) // уже первое слово быстрее экзамена
  })
  it('окно ответа = сколько пилюля слушает: экзамен 6769 мс, при множителе K — в K раз меньше; движок даёт то же окно', () => {
    expect(windowMs(BOSS_SPEED)).toBe(6769); expect(windowMs(BOSS_SPEED * 3.8)).toBe(1781); expect(windowMs(BOSS_SPEED * 1.3)).toBe(5207)
    const step = { id: 'b', kind: 'student', labels: [], active: [0, 1, 2], parts: [0], text: 'кот', chunks: ['кот'], chunkMs: [400], reps: [{ parts: [0], lane: 1, speed: BOSS_SPEED * 3.8, cap: 'cat' }], maxTries: 1, overlap: false, lang: 'ru' }
    const g = createStudentGame({ step, chunks: ['кот'], maxTries: 1 }); let open = -1, shut = -1
    for (let t = 0; t <= 6000 && shut < 0; t += 4) { stepStudent(g, t, {}); const on = isClaimable(g.reps[0]); if (on && open < 0) open = t; if (!on && open >= 0) shut = t }
    expect(shut - open).toBeGreaterThan(1781 - 12); expect(shut - open).toBeLessThan(1781 + 12)
  })
  it('нижняя граница: окно каждого слова не меньше минимума «реакция + слоги + тишина + итог Vosk»; длинное слово само ограничивает множитель', () => {
    expect(minWindowMs('привет', 'ru')).toBe(700 + 2 * 180 + 220 + 350); expect(minWindowMs('путешествовать', 'ru')).toBe(700 + 5 * 180 + 220 + 350)
    expect(kMax('привет', 'ru')).toBeGreaterThan(3.8); expect(kMax('путешествовать', 'ru')).toBe(3.11); expect(kMax('на самом деле очень хорошо получилось', 'ru')).toBeGreaterThanOrEqual(1)
    const long = ['a', 'b', 'c', 'd', 'e', 'f'].map(text => ({ text, translation: 'путешествовать' })), { list } = bonusWords(long, true, 'x')
    expect(list.map(w => w.k)).toEqual([1.3, 1.6, 1.9, 2.8, 3.11, 3.11]); for (const w of list) expect(w.win).toBeGreaterThanOrEqual(minWindowMs('путешествовать', 'ru'))
    for (const seed of ['a', 'b', 'c']) for (const ru of [true, false]) for (const w of bonusWords(blocksOf(game()).flatMap(x => x.words), ru, seed).list) { expect(w.win).toBeGreaterThanOrEqual(minWindowMs(bonusTarget(w, ru), ru ? 'ru' : 'en')); expect(w.speed).toBeCloseTo(BOSS_SPEED * w.k, 3); expect(w.win).toBe(windowMs(w.speed)) }
  })
  it('в игре: скорости пилюль круга растут, последние три — самые быстрые (длинный перевод режет множитель, но порядок «всё быстрее» остаётся)', () => {
    const st = game(); route(st, exam(st)); const round = st[sidAt(st, BONUS_SID)], sp = round.step.reps.map(r => r.speed)
    expect(sp).toEqual([1.3, 1.6, 1.9, 2.8, 3.3, 3.8].map((k, i) => +(BOSS_SPEED * Math.min(k, kMax(round.words[i].translation, 'ru'))).toFixed(4))); expect(sp.every((x, i) => i === 0 || x > sp[i - 1])).toBe(true); expect(Math.min(...sp.slice(-3))).toBeGreaterThan(Math.max(...sp.slice(0, -3))); expect(Math.min(...sp)).toBeGreaterThan(BOSS_SPEED)
  })
})

describe('в бонус-круге Пит и Мия молчат; исход экзамена и трофеи Мии не меняются', () => {
  const st = game(); route(st, exam(st))
  const ann = st[sidAt(st, BONUS_ANN_SID)], round = st[sidAt(st, BONUS_SID)], end = st[sidAt(st, 'boss-end')]
  const bonus = evs => { let m = exam(st); const say = []; for (const stage of [ann, round]) { const r = reduceMia(m, { t: 'enter', stage }); say.push(...r.say); m = r.mia } const cut = say.length; for (const e of evs) { const r = reduceMia(m, { stage: round, ...e }); say.push(...r.say); m = r.mia } return { m, say, inRound: say.slice(cut) } }
  it('реплика Мии — одна, на стадии без плашки и без трёх нот; Мия остаётся на коробке, дорожки её цвета', () => {
    const r = bonus([]); expect(r.say.map(c => [c.id, c.who])).toEqual([[BONUS_LINE, 'mia']]); expect(r.m.phase).toBe('in'); expect(r.m.fast).toBe(true)
    expect(miaLine(BONUS_LINE)).toMatchObject({ who: 'mia', text: 'раз для тебя это просто, я ускоряю игру', tts: 'Раз для тебя это просто… Я ускоряю игру!' })
    expect(ann).toMatchObject({ type: 'announce', mia: 'hold', count: false, line: null, round: { title: '', task: '', brief: '' } }); expect(ann.count).toBe(false)
  })
  it('ни на верное слово, ни на ошибку, ни на ушедшее слово в очередь речи ничего не встаёт: нет колкостей, нет «это значит», нет «Следующее слово»', () => {
    const r = bonus([{ t: 'zone', zone: 'fast', idx: 0 }, { t: 'win', idx: 0 }, { t: 'zone', zone: 'mid', idx: 1 }, { t: 'win', idx: 1 }, { t: 'win', idx: 2 }, { t: 'miss', idx: 3 }, { t: 'fail', idx: 3, spoke: true }, { t: 'fail', idx: 4, spoke: false }, { t: 'fail', idx: 5 }])
    expect(r.inRound).toEqual([]); expect(round.step.reps.every(x => x.say == null)).toBe(true) // слова круга голосом не называются
    const src = read('../useRaceActs.js')
    expect(src).toContain('if (running?.bonus) { pLog(bonusPreLine(running, rep)); markAsked(mb); speech.translation(0); return }') // директор: перед пилюлей бонуса Пит не говорит ничего — пилюля выезжает сразу
    expect(src.indexOf('if (running?.bonus) {')).toBeLessThan(src.indexOf('surface.run(e?.wait')); expect(read('./bossMia.js')).toContain('if (ev.stage?.bonus) return bonusRound(m, ev)')
  })
  it('счёт бонуса свой: исход «успех», трофеи экзамена и счёт Мии прежние, даже если в бонусе не названо ни одного слова', () => {
    const none = bonus(round.words.map((_, idx) => ({ t: 'fail', idx, spoke: false })))
    expect(bonusOf(none.m)).toEqual({ total: 6, won: 0 }); expect(examOf(none.m, true)).toMatchObject({ got: 120, max: 120, lost: 0, outcome: 'free' }); expect(none.m.dug).toEqual({}); expect(none.m.failed).toEqual({})
    const some = bonus([{ t: 'zone', zone: 'slow', idx: 0 }, { t: 'win', idx: 0 }, { t: 'win', idx: 1 }, { t: 'zone', zone: 'mid', idx: 1 }, { t: 'fail', idx: 2 }])
    expect(bonusOf(some.m)).toEqual({ total: 6, won: 2 }); expect(some.m.bonus.zones).toEqual({ 0: 'slow', 1: 'mid' }); expect(examOf(some.m, true)).toMatchObject({ got: 120, lost: 0, outcome: 'free' }); expect(some.m.redWins).toBe(0)
    expect(bonusOf(exam(st))).toBeNull(); expect(bonusOf(reduceMia(some.m, { t: 'enter', stage: round }).mia)).toEqual({ total: 6, won: 2 }) // повторный вход в стадию счёт не теряет; а новая попытка экзамена (церемония → первый блок с нуля) — обнуляет:
    const again = reduceMia(reduceMia(some.m, { t: 'enter', stage: { type: 'announce', act: 'boss', sid: 'boss-ann', mia: 'ann', always: true, script: 'boss' }, now: 0 }).mia, { t: 'enter', stage: blocksOf(st)[0] }).mia
    expect(bonusOf(again)).toBeNull()
  })
  it('после бонус-круга — обычная концовка успеха: «вот твои трофеи» → «…пока» (на ней Мия уходит с коробкой) → Пит', () => {
    expect(st.slice(sidAt(st, BONUS_SID) + 1).map(x => x.sid)).toEqual(['boss-end', 'summary'])
    const { m } = bonus(round.words.map((_, idx) => ({ t: 'fail', idx }))), r = reduceMia(m, { t: 'enter', stage: end, now: 1000 })
    expect(r.say.map(c => c.id)).toEqual(['boss_mia_free', 'boss_mia_bye']); expect(r.mia).toMatchObject({ outcome: 'free', bye: 'boss_mia_bye', keep: false })
    const bye = reduceMia(r.mia, { t: 'bye', id: 'boss_mia_bye', now: 5000 }); expect(bye.mia.phase).toBe('out'); expect(bye.say.map(c => c.id)).toEqual(['boss_pit_well'])
  })
  it('журнал: строка [exam] на слово бонуса с пометкой «бонус», множителем и окном; счёт экзамена в ней не меняется', () => {
    const w = round.words[0]; let m = bonus([]).m; const a = reduceMia(m, { t: 'zone', zone: 'fast', idx: 0, stage: round }).mia, b = reduceMia(a, { t: 'win', idx: 0, stage: round }).mia
    expect(examWordLine(m, a, { t: 'zone', zone: 'fast', idx: 0, stage: round })).toBeNull()
    expect(examWordLine(a, b, { t: 'win', idx: 0, stage: round })).toBe(`[exam] бонус, слово 1 из 6 «${w.text}» ×1,3 (окно 5207 мс): зона зелёная, игроку +20; бонус-круг 1 из 6`)
    m = reduceMia(b, { t: 'fail', idx: 5, stage: round }).mia
    const last = round.words[5]; expect(last.k).toBe(Math.min(3.8, kMax(last.translation, 'ru'))); expect(last.win).toBe(windowMs(last.speed))
    expect(examWordLine(b, m, { t: 'fail', idx: 5, stage: round })).toBe(`[exam] бонус, слово 6 из 6 «${last.text}» ×${String(last.k).replace('.', ',')} (окно ${last.win} мс): не названо, игроку +0; бонус-круг 1 из 6`)
    expect(examWordLine(m, reduceMia(m, { t: 'fail', idx: 5, stage: round }).mia, { t: 'fail', idx: 5, stage: round })).toBeNull() // одно слово — одна строка
  })
})

describe('пауза и таймеры: бонус-круг своих очередей не заводит', () => {
  it('модуль бонуса — чистые функции: ни таймеров, ни своего цикла кадров; переход стадий — только общий next директора (на паузе он не идёт)', () => {
    const src = read('./bossBonus.js'); for (const bad of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'performance.now', 'Date.now']) expect(src).not.toContain(bad)
    const acts = read('../useRaceActs.js')
    expect(acts).toContain('if (!miaOn() || pausedRef.current) return'); expect(acts).toContain('const bonus = bonusRoute(stages, miaSkip(stages, r, mb.m, baseNext), mb.m, seed)') // машина Мии на паузе событий не принимает; маршрут бонуса — внутри nextIdx
    expect(read('../../player/modules/rotate-phone/useWordLaneFlow.js')).toContain("if (sRef.current.stage === 'paused') { pLog(PAUSED_NEXT_LOG); return } const i = nextIdx(sRef.current.idx + 1)")
  })
  it('пока ступень не шагает (пауза), пилюля бонуса не едет и «не успел» не наступает', () => {
    const st = game(); route(st, exam(st)); const step = st[sidAt(st, BONUS_SID)].step, g = createStudentGame({ step, chunks: step.chunks, maxTries: 1 }), seen = []
    for (let t = 0; t <= 800; t += 16) seen.push(...stepStudent(g, t, {}).map(e => e.type))
    const y = g.reps[0].pills[0]?.y; expect(seen).toContain('spawn'); expect(seen).not.toContain('fail') // 800 мс игры, потом «пауза» на минуту: шагов нет — состояние то же
    expect(g.reps[0].pills[0].y).toBe(y); expect(g.reps[0].state).toBe('fly')
  })
})
