import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildActs } from './rehearsalRecipe.js'
import { buildRehearsalStages } from './rehearsalStages.js'
import { ONLY_ACTS, ONLY_IDS, ONLY_TITLES, onlyOf, pickActs } from './rehearsalOnly.js'
import { fixturePlan } from './rehearsalFixtures.js'
import { normalizePlan } from './rehearsalPlan.js'
import { readRehearsalCfg } from './rehearsalCfg.js'
import { demoSummary, nullStore, DEMO_TEMPO } from './polish/polishDemo.js'
import { reportSession, SIM_KEY } from './rehearsalSim.js'
import { createJournal } from './rehearsalJournal.js'
import { actAvailable, planForAct, POLISH_ACTS } from './polish/polishActs.js'
import { saveRehearsalForm, subscribeRehearsalForm, defaultRehearsalForm } from './rehearsalTestForm.js'

// «Шлифовка репетиции»: план с only играет только акты одного этапа (заставка, разминка, читка, сборка, без текста, «Различи», дубль и зеркало, итог)
const ids = acts => acts.map(a => a.id)
const withOnly = (plan, only) => ({ ...plan, only })
const stagesOf = (plan, only) => buildRehearsalStages({ plan: withOnly(plan, only), rate: 1, lib: () => null }).stages

afterEach(() => vi.unstubAllGlobals())

describe('рецепт с only', () => {
  const three = fixturePlan('three')
  it('каждый этап оставляет только свои акты (дубль идёт с зеркалом, заставка — одна плашка)', () => {
    const got = Object.fromEntries(ONLY_IDS.map(id => [id, ids(buildActs(three, { only: id }).acts)]))
    expect(got).toEqual({ intro: ['intro'], warmup: ['warmup'], read: ['read'], build: ['build'], blind: ['blind'], discern: ['discern'], take: ['take', 'mirror'], summary: ['summary'] })
  })
  it('без only — весь сценарий как раньше; only берётся и из самого плана', () => {
    expect(ids(buildActs(three).acts)).toEqual(['warmup', 'read', 'build', 'blind', 'discern', 'take', 'mirror', 'summary'])
    expect(ids(buildActs(withOnly(three, 'read')).acts)).toEqual(['read'])
    expect(ids(buildActs(withOnly(three, 'read'), { only: 'build' }).acts)).toEqual(['build']) // явный параметр сильнее
  })
  it('нет этапа в плане — заставка (игре есть что играть): «Различи» у фразы без двойников, читка у одного слова', () => {
    expect(ids(buildActs(fixturePlan('two'), { only: 'discern' }).acts)).toEqual(['intro'])
    expect(ids(buildActs(fixturePlan('one'), { only: 'read' }).acts)).toEqual(['intro'])
    expect(ids(buildActs(fixturePlan('one'), { only: 'warmup' }).acts)).toEqual(['word']) // у одного слова разминка — «слово ×2»
  })
  it('таблица этапов: названия по порядку сценария, onlyOf сводит акт к этапу, незнакомое — заставка, pickActs без only не трогает', () => {
    expect(ONLY_IDS.map(id => ONLY_TITLES[id])).toEqual(['Заставка', 'Разминка', 'Читка', 'Сборка с конца', 'Без текста', 'Различи', 'Дубль и зеркало', 'Итог'])
    expect(['warmup', 'word', 'read', 'build', 'blind', 'discern', 'take', 'mirror', 'summary', 'intro', 'нет'].map(onlyOf)).toEqual(['warmup', 'warmup', 'read', 'build', 'blind', 'discern', 'take', 'take', 'summary', 'intro', 'intro'])
    const acts = [{ id: 'a' }]
    expect(pickActs(acts, null)).toBe(acts); expect(pickActs(acts, 'нет такого')).toBe(acts)
    expect(Object.values(ONLY_ACTS).flat()).toContain('mirror')
  })
})

describe('стадии с only', () => {
  const three = fixturePlan('three')
  it('«Сборка с конца»: плашка акта и ступени сборки, ничего чужого; журнал и слушатель — как в полном сценарии', () => {
    const s = stagesOf(three, 'build')
    expect(s[0]).toMatchObject({ type: 'announce', act: 'build' })
    expect(new Set(s.map(x => x.act))).toEqual(new Set(['build']))
    expect(s.filter(x => x.type === 'student').map(x => x.sid)).toEqual(['build-0', 'build-0r', 'build-1', 'build-1r', 'build-clear', 'build-normal'])
    expect(s.some(x => x.type === 'summary' || x.type === 'warmup')).toBe(false)
  })
  it('«Заставка»: одна плашка без реплики; «Итог»: один экран итога', () => {
    const intro = stagesOf(three, 'intro')
    expect(intro).toHaveLength(1)
    expect(intro[0]).toMatchObject({ type: 'announce', act: 'intro', line: null, round: { title: 'Заставка' } })
    expect(stagesOf(three, 'summary').map(x => x.type)).toEqual(['summary'])
  })
  it('«Дубль и зеркало»: плашка дубля, сам дубль с записью и зеркало', () => {
    const s = stagesOf(three, 'take')
    expect(s.map(x => x.type)).toEqual(['announce', 'take', 'mirror'])
    expect(s[1].step.record).toBe(true)
  })
  it('«Без текста», «Различи», «Разминка», «Читка» — свои стадии', () => {
    expect(new Set(stagesOf(three, 'blind').map(x => x.act))).toEqual(new Set(['blind']))
    expect(stagesOf(three, 'discern').map(x => x.type)).toContain('discern')
    expect(new Set(stagesOf(three, 'warmup').map(x => x.act))).toEqual(new Set(['warmup']))
    expect(stagesOf(three, 'read').map(x => x.type)).toEqual(['announce', 'read', 'turn', 'student'])
  })
})

describe('план с only', () => {
  it('normalizePlan хранит только известный only; обычный план его не получает', () => {
    expect(normalizePlan({ phrase: 'a | b', only: 'build' }).only).toBe('build')
    expect('only' in normalizePlan({ phrase: 'a | b', only: 'чушь' })).toBe(false)
    expect('only' in fixturePlan('three')).toBe(false)
  })
  it('нода с plan.only читается в cfg.plan.only; planForAct ставит и снимает пометку', () => {
    expect(readRehearsalCfg({ phrase: 'a | b', only: 'take' }).plan.only).toBe('take')
    const p = fixturePlan('three')
    expect(planForAct(p, 'read').only).toBe('read')
    expect(planForAct(withOnly(p, 'read'), null).only).toBeUndefined()
    expect(planForAct(null, 'read')).toBeNull()
  })
  it('какие этапы есть в плане: у одного слова нет читки и сборки, у фразы без двойников нет «Различи»; заставка и итог — всегда', () => {
    const avail = plan => POLISH_ACTS.filter(a => actAvailable(plan, a.id)).map(a => a.id)
    expect(avail(fixturePlan('three'))).toEqual(ONLY_IDS)
    expect(avail(fixturePlan('two'))).toEqual(['intro', 'warmup', 'read', 'build', 'blind', 'take', 'summary'])
    expect(avail(fixturePlan('one'))).toEqual(['intro', 'warmup', 'blind', 'discern', 'take', 'summary'])
    expect(actAvailable(null, 'intro')).toBe(false)
  })
})

describe('«Итог» с подставным результатом', () => {
  it('темп ×1.3, заметка-пример, XP; настоящая память сессии (sessionStorage) не трогается', () => {
    const real = { getItem: vi.fn(() => null), setItem: vi.fn() }
    vi.stubGlobal('sessionStorage', real)
    const plan = fixturePlan('three')
    const res = reportSession({ plan, ...demoSummary(plan), log: () => {} })
    expect(res.tempo).toBe(DEMO_TEMPO)
    expect(res.note.key).toBe('demo')
    expect(res.xp).toBeGreaterThan(0)
    expect(res.phraseDone).toBe(true)
    expect(real.setItem).not.toHaveBeenCalled()
    expect(nullStore.getItem(SIM_KEY)).toBeNull()
  })
  it('пустой журнал (настоящий итог без игры) тоже считается без ошибок', () => {
    expect(() => reportSession({ plan: fixturePlan('one'), journal: createJournal(), store: nullStore, log: () => {} })).not.toThrow()
  })
})

describe('общая форма «Теста игры» и «Шлифовки»', () => {
  it('saveRehearsalForm оповещает подписчиков, отписка работает; сбой подписчика не мешает сохранению', () => {
    const seen = []
    const off = subscribeRehearsalForm(f => seen.push(f.fixture))
    const off2 = subscribeRehearsalForm(() => { throw new Error('x') })
    const store = { setItem: vi.fn() }
    saveRehearsalForm({ ...defaultRehearsalForm(), fixture: 'two' }, store)
    expect(seen).toEqual(['two']); expect(store.setItem).toHaveBeenCalledTimes(1)
    off(); off2()
    saveRehearsalForm({ ...defaultRehearsalForm(), fixture: 'one' }, store)
    expect(seen).toEqual(['two'])
  })
})
