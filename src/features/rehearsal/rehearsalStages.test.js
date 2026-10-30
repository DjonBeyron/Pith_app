import { describe, it, expect } from 'vitest'
import { buildRehearsalStages, labelsForRehearsal, RH_TAKE_MS, MAX_VOCAB } from './rehearsalStages.js'
import { buildStages, listenStepOf, labelsFor } from '../player/modules/rotate-phone/wordLaneStages.js'
import { stepTargets } from '../player/modules/rotate-phone/wordLaneRecipe.js'
import { createJournal, record, shouldRun, nextRunnable, weakLanes, missesIn } from './rehearsalJournal.js'
import { engineKind, isStudentStage } from './rehearsalKinds.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { baseLineId } from './rehearsalLines.js'

const VOICED = () => ({ ms: 600, lead: 0 }) // куски озвучены в библиотеке слов
// Семя 'd' (rehearsalVariety / rehearsalDiscern): три куска — разминка learn (дорожка 0) → trying (дорожка 1), «чётко» → «обычно», при «застрял» сначала слово, потом перевод куска; «Различи»: learn / lean на 0 и 2, потом все три
const plan = (id, seed = 'd') => ({ ...fixturePlan(id), seed })
const build = (id, o = {}) => buildRehearsalStages({ plan: plan(id, o.seed), rate: 1, lib: () => null, ...o })
const types = st => st.map(s => `${s.type}:${s.sid}`)

// Стадии репетиции: тот же формат, что у buildStages, плюс новые типы; подписи и правила пропуска
describe('buildStages делегирует репетиции, если есть plan', () => {
  it('с планом — стадии актов (warmup, read, take, mirror, summary), без — как раньше', () => {
    const r = buildStages({ chunks: fixturePlan('three').chunks, plan: plan('three') })
    expect(r.stages.some(s => s.type === 'warmup')).toBe(true)
    expect(r.stages.at(-1).type).toBe('summary')
    expect(r.stages.every((s, i) => s.idx === i)).toBe(true)
    expect(buildStages({ chunks: ['a', 'b'] }).stages.some(s => s.act)).toBe(false)
  })
  it('те же поля, что ждёт директор: chunkMs, chunkCurves, lanes, clipMode (озвучки автора нет)', () => {
    const r = build('three')
    expect(r.chunkMs).toHaveLength(3); expect(r.chunkCurves).toEqual([null, null, null]); expect(r.lanes).toHaveLength(3)
    expect(r.clipMode([0, 1, 2])).toBe(false)
  })
})

describe('акты на стадиях', () => {
  it('три куска: порядок стадий по актам', () => {
    const { stages } = build('three')
    expect(types(stages)).toEqual([
      'announce:warmup-ann', 'warmup:warmup-1', 'warmup:warmup-0',
      'announce:read-ann', 'read:read-d', 'turn:read-t', 'student:read-s',
      'announce:build-ann', 'dictor:build-0-d', 'turn:build-0-t', 'student:build-0', 'dictor:build-0r-d', 'turn:build-0r-t', 'student:build-0r',
      'dictor:build-1-d', 'turn:build-1-t', 'student:build-1', 'dictor:build-1r-d', 'turn:build-1r-t', 'student:build-1r',
      'dictor:build-final-d', 'announce:build-clear-ann', 'student:build-clear', 'announce:build-normal-ann', 'student:build-normal',
      'announce:blind-ann', 'student:blind-0', 'student:blind-1',
      'announce:discern-0-ann', 'discern:discern-0', 'warmup:discern-say-0',
      'announce:take-ann', 'take:take', 'mirror:mirror', 'summary:summary',
    ])
  })
  it('разминка: слово по переводу — цель слово, пилюля в дорожке слова, словарь Vosk — слова фразы и двойники', () => {
    const w = build('three').stages.find(s => s.sid === 'warmup-1')
    expect(w.word).toMatchObject({ text: 'learn', lane: 0, chunkLane: 2, idx: 1 }) // дорожка пилюли случайная (семя), chunkLane — где слово стоит во фразе, idx — номер в плане (по нему sid)
    expect(w.step.parts).toEqual([0])
    expect(w.step.chunks).toEqual(['learn', '', ''])
    expect(w.step.chunkMs[0]).toBeGreaterThan(0)
    expect(stepTargets(w.step, w.step.chunks).texts).toEqual(['learn'])
    expect(w.step.extra).toEqual(expect.arrayContaining(['earn', 'lean', 'trying']))
    expect(w.step.extra).not.toContain('learn')
    expect(w.step.extra.length).toBeLessThanOrEqual(MAX_VOCAB)
    expect(w.step.maxWords).toBe(2)
    expect(w.caption).toBe('учиться')
  })
  it('читка: диктор говорит всю фразу куски за куском (один повтор), подсветка по таймингам, потом ученик один раз', () => {
    const { stages } = build('three', { lib: VOICED })
    const read = stages.find(s => s.type === 'read')
    expect(read.plan.reps).toHaveLength(1)
    expect(read.plan.reps[0].parts).toEqual([0, 1, 2])
    expect(read.metro.map(m => m.chunk)).toEqual([0, 1, 2])
    expect(read.metro[1].at).toBeGreaterThan(read.metro[0].at)
    const stu = stages.find(s => s.sid === 'read-s')
    expect(stu.step.reps).toHaveLength(1)
    expect(stu.metro.map(m => m.chunk)).toEqual([0, 1, 2])
  })
  it('нет озвучки кусков — читка без подсветки (metro пуст); есть — с подсветкой', () => {
    const mute = build('three')
    expect(mute.stages.find(s => s.type === 'read').metro).toEqual([])
    expect(mute.stages.find(s => s.sid === 'read-s').metro).toEqual([])
    const voiced = build('three', { lib: VOICED })
    expect(voiced.stages.find(s => s.type === 'read').metro).toHaveLength(3)
    expect(voiced.stages.find(s => s.sid === 'read-s').metro).toHaveLength(3)
  })
  it('сборка: диктор ×1 и человек ×1 на ступени; ступень ещё раз — только при промахе (cond retry); последняя — «чётко» → «обычно» с ярлыками', () => {
    const { stages } = build('three')
    const by = sid => stages.find(s => s.sid === sid)
    expect(by('build-0').step.parts).toEqual([2]); expect(by('build-1').step.parts).toEqual([1, 2])
    expect(by('build-0').step.reps).toHaveLength(1)
    expect(by('build-0-d').plan.reps).toHaveLength(1)
    expect(by('build-0r').cond).toEqual({ retry: 'build-0' })
    expect(by('build-1r-d').cond).toEqual({ retry: 'build-1' })
    expect(by('build-final-d').cond).toBeUndefined()
    expect(by('build-clear').tag).toBe('Чётко — для последнего ряда')
    expect(by('build-normal').tag).toBe('Обычно')
    expect(baseLineId(by('build-clear-ann').line)).toBe('rh_clear'); expect(baseLineId(by('build-normal-ann').line)).toBe('rh_normal')
    expect(by('build-clear-ann').round.title).toBe('') // плашка-ярлык, не большая плашка
    expect(by('build-clear').step.reps).toHaveLength(1); expect(by('build-normal').step.reps).toHaveLength(1)
  })
  it('без текста: два прохода всей фразы, подписей нет, второй — по условию; подсказка — первое слово, дорожка 0', () => {
    const { stages } = build('three')
    const b0 = stages.find(s => s.sid === 'blind-0'), b1 = stages.find(s => s.sid === 'blind-1')
    expect(b0.step.labels).toEqual([]); expect(b1.cond).toEqual({ few: true })
    expect(b0).toMatchObject({ hintWord: "I'm", hintLane: 0, hintKinds: ['word', 'tr'], hintTr: 'Я пытаюсь научиться' }); expect(b1.hintKinds).toEqual(['tr', 'word']) // подсказки: сначала слово, потом перевод; второй проход — наоборот
    expect(stepTargets(b0.step, ['I\'m', 'trying', 'to learn']).texts).toEqual(["I'm trying to learn"])
  })
  it('«Различи»: стадия discern с двойниками, диктор называет слово (sayText), потом слово надо сказать (словарь — тройка)', () => {
    const { stages } = build('three')
    const d = stages.find(s => s.type === 'discern')
    expect(d.prompts).toHaveLength(2)
    expect(d.prompts[0].texts.filter(Boolean).sort()).toEqual(['lean', 'learn']) // первая подсказка — слово и ОДИН случайный двойник
    expect(d.prompts[1].texts.filter(Boolean).sort()).toEqual(['earn', 'lean', 'learn']) // вторая — слово и оба двойника
    expect(d.prompts.every(p => p.text === 'learn')).toBe(true)
    expect(d.sayText).toBe('learn')
    const say = stages.find(s => s.sid === 'discern-say-0')
    expect(say.noLabel).toBe(true); expect(say.step.extra).toEqual(expect.arrayContaining(['earn', 'lean']))
  })
  it('дубль: плашка «Дубль. Три, два, один…» и вся фраза ×1 как обычная ступень ученика; зеркало и итог — экраны', () => {
    const { stages } = build('three')
    const ann = stages.find(s => s.sid === 'take-ann')
    expect(ann.round.title).toBe('Дубль. Три, два, один…'); expect(ann.ms).toBe(RH_TAKE_MS); expect(baseLineId(ann.line)).toBe('rh_take')
    const take = stages.find(s => s.type === 'take')
    expect(take.step.reps).toHaveLength(1); expect(take.step.parts).toEqual([0, 1, 2])
    expect(stages.at(-2).type).toBe('mirror'); expect(stages.at(-1).type).toBe('summary')
  })
  it('дубль идёт с записью (step.record: слушатель без затвора тишины); окон речи Пита на нём нет — реплика «Дубль…» на плашке до него; остальные ступени без record', () => {
    const { stages } = build('three')
    const take = stages.find(s => s.type === 'take')
    expect(take.step.record).toBe(true); expect(take.line).toBeUndefined(); expect(take.ms).toBeUndefined()
    expect(stages.filter(s => s.step?.record)).toHaveLength(1)
    expect(listenStepOf(stages, take.idx - 1)).toBe(take.step) // под плашкой слушатель уже тот же — записывающий
  })
  it('зеркало: Пит говорит «Слушаем, сначала я, потом ты» на старте стадии (rh_mirror), у итога реплики нет (её говорит директор)', () => {
    const { stages, recipe } = build('three')
    expect(baseLineId(stages.find(s => s.type === 'mirror').line)).toBe('rh_mirror'); expect(stages.find(s => s.type === 'summary').line).toBeUndefined()
    expect(recipe.acts.find(a => a.id === 'mirror').line).toBe(stages.find(s => s.type === 'mirror').line)
  })
  it('одно слово: «слово ×2» вместо разминки и сборки, потом слово по переводу, различи, дубль', () => {
    const { stages } = build('one')
    expect(types(stages)).toEqual(['announce:word-ann', 'warmup:word-0', 'announce:blind-ann', 'warmup:blind-0', 'announce:discern-0-ann', 'discern:discern-0', 'warmup:discern-say-0', 'announce:take-ann', 'take:take', 'mirror:mirror', 'summary:summary'])
    expect(stages[1].step.reps).toHaveLength(2)
    expect(stages[3].hintWord).toBe('remember')
    expect(stages[3].caption).toBe('помнить')
  })
  it('у каждой стадии свой idx и sid; sid не повторяются', () => {
    for (const id of ['three', 'two', 'one', 'none']) {
      const { stages } = build(id)
      expect(stages.every((s, i) => s.idx === i && s.sid && s.act)).toBe(true)
      expect(new Set(stages.map(s => s.sid)).size).toBe(stages.length)
    }
  })
})

describe('типы стадий и слушатель', () => {
  it('движковый вид: warmup и take — ученик, read — диктор, остальное как есть', () => {
    expect(['warmup', 'take', 'read', 'student', 'dictor', 'mirror', 'summary', 'announce'].map(t => engineKind({ type: t }))).toEqual(['student', 'student', 'dictor', 'student', 'dictor', 'mirror', 'summary', 'announce'])
    expect(isStudentStage({ type: 'warmup' })).toBe(true); expect(isStudentStage({ type: 'read' })).toBe(false); expect(isStudentStage(null)).toBe(false)
  })
  it('слушатель стартует заранее: под плашкой перед warmup / take и «твоей очередью»', () => {
    const { stages } = build('three')
    const at = sid => stages.findIndex(s => s.sid === sid)
    expect(listenStepOf(stages, at('warmup-ann'))).toBe(stages[at('warmup-1')].step) // первым идёт самое просроченное слово (learn, sid warmup-1)
    expect(listenStepOf(stages, at('take-ann'))).toBe(stages[at('take')].step)
    expect(listenStepOf(stages, at('read-t'))).toBe(stages[at('read-s')].step)
    expect(listenStepOf(stages, at('build-clear-ann'))).toBe(stages[at('build-clear')].step)
    expect(listenStepOf(stages, at('mirror'))).toBeNull()
  })
})

describe('подписи дорожек', () => {
  const chunks = ["I'm", 'trying', 'to learn']
  const { stages } = build('three', { lib: VOICED })
  const at = sid => stages.find(s => s.sid === sid)
  const texts = l => l.map(x => x.text)
  it('разминка: над дорожкой слова — перевод, остальные пусты; после «не успел» — подсказка словом', () => {
    expect(texts(labelsFor(at('warmup-1'), chunks, [], []))).toEqual(['учиться', '', ''])
    expect(labelsFor(at('warmup-1'), chunks, [], [])[0].on).toBe(true)
    expect(texts(labelsFor(at('warmup-1'), chunks, [], [0]))).toEqual(['learn', '', ''])
  })
  it('сборка: подписи всех кусков, ярче куски ступени', () => {
    const l = labelsFor(at('build-1'), chunks, [], [])
    expect(texts(l)).toEqual(chunks); expect(l.map(x => x.on)).toEqual([false, true, true])
  })
  it('«без текста» и дубль: подписей и перевода нет; хинт показывает кусок', () => {
    expect(texts(labelsFor(at('blind-0'), chunks, [], []))).toEqual(['', '', ''])
    expect(texts(labelsFor(at('take'), chunks, [], []))).toEqual(['', '', ''])
    expect(texts(labelsFor(at('blind-0'), chunks, [], [0]))).toEqual(["I'm", '', ''])
    expect(texts(labelsFor(at('blind-0'), chunks, [], [{ lane: 0, text: 'Я пытаюсь' }]))).toEqual(['Я пытаюсь', '', '']) // подсказка-перевод куска: свой текст на дорожке
  })
  it('читка: подсвечен только звучащий кусок (hl), без подсветки — все ярко', () => {
    expect(labelsFor(at('read-d'), chunks, [], [], 1).map(x => x.on)).toEqual([false, true, false])
    expect(labelsFor(at('read-s'), chunks, [], [], -1).map(x => x.on)).toEqual([false, false, false])
    const plain = build('three').stages.find(s => s.type === 'read') // без озвучки подсветки нет — все куски ярко
    expect(labelsForRehearsal(plain, chunks, [], -1).every(x => x.on)).toBe(true)
  })
  it('«Различи» и итог — над дорожками пусто; «Различи»-слово без подписи, пока не подсказали', () => {
    expect(texts(labelsFor(at('discern-0'), chunks, [0, 1, 2], []))).toEqual(['', '', ''])
    expect(texts(labelsFor(at('summary'), chunks, [], []))).toEqual(['', '', ''])
    expect(texts(labelsFor(at('discern-say-0'), chunks, [], []))).toEqual(['', '', ''])
    expect(texts(labelsFor(at('discern-say-0'), chunks, [], [2]))).toEqual(['', '', 'learn']) // у слова «Различи» дорожка своя (по фразе), не случайная
  })
  it('ярлык над дорожками не на пилюле: у стадий «чётко / обычно» подписи кусков остаются обычными, а tag лежит на стадии', () => {
    expect(texts(labelsFor(at('build-clear'), chunks, [], []))).toEqual(chunks)
    expect(at('build-clear').tag.length).toBeGreaterThan(0)
  })
})

describe('журнал и правила пропуска', () => {
  const { stages } = build('three')
  const st = sid => stages.find(s => s.sid === sid)
  it('ступень повторяется, только если у неё был промах (один раз)', () => {
    const j = createJournal()
    expect(shouldRun(st('build-0r'), j)).toBe(false)
    record(j, st('build-0'), 'fail')
    expect(shouldRun(st('build-0r'), j)).toBe(true); expect(shouldRun(st('build-1r'), j)).toBe(false)
    expect(nextRunnable(stages, st('build-0').idx + 1, j)).toBe(st('build-0r-d').idx)
    const clean = createJournal(); record(clean, st('build-0'), 'win')
    expect(nextRunnable(stages, st('build-0').idx + 1, clean)).toBe(st('build-1-d').idx) // повтор пропущен
  })
  it('промахов ≥ 3 к акту 4: второй проход «без текста» и «Различи» пропускаются, зеркало остаётся', () => {
    const j = createJournal()
    record(j, st('warmup-0'), 'miss'); record(j, st('read-s'), 'fail'); record(j, st('build-0'), 'miss')
    expect(missesIn(j)).toBe(3)
    expect(shouldRun(st('blind-0'), j)).toBe(true); expect(shouldRun(st('blind-1'), j)).toBe(false)
    expect(shouldRun(st('discern-0-ann'), j)).toBe(false); expect(shouldRun(st('discern-0'), j)).toBe(false); expect(shouldRun(st('discern-say-0'), j)).toBe(false)
    expect(nextRunnable(stages, st('blind-0').idx + 1, j)).toBe(st('take-ann').idx)
    expect(shouldRun(st('mirror'), j)).toBe(true)
  })
  it('промахов мало — идут оба прохода и «Различи»; промахи самого акта 4 не в счёт', () => {
    const j = createJournal()
    record(j, st('warmup-0'), 'miss'); record(j, st('blind-0'), 'fail'); record(j, st('blind-0'), 'fail'); record(j, st('blind-0'), 'fail')
    expect(shouldRun(st('blind-1'), j)).toBe(true); expect(shouldRun(st('discern-0'), j)).toBe(true)
  })
  it('слово разминки, не давшееся дважды, — слабая дорожка (в «без текста» у неё подпись)', () => {
    const j = createJournal()
    record(j, st('warmup-1'), 'fail'); expect(weakLanes(j, stages)).toEqual([])
    record(j, st('warmup-1'), 'miss'); expect(weakLanes(j, stages)).toEqual([2])
  })
  it('мусор в журнал не попадает', () => {
    const j = createJournal()
    record(j, null, 'win'); record(j, st('take'), 'bogus')
    expect(j.stages).toEqual({})
  })
})
