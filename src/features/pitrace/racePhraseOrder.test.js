import { describe, it, expect, vi } from 'vitest'
import { orderedHits, scorePhrases, pickPhrase } from './racePhraseScore.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'
import { JOIN_WBW_MS } from './racePhraseListen.js'
import { createSaid } from './racePhraseSaid.js'
import { createSayView } from './racePhraseSayView.js'
import { mountMask } from './racePhraseMaskView.js'
import { fillGoal, graceMs, edgeVerdict, LAST_WORD_GRACE_MS, LAST_WORD_GRACE_WBW_MS, GRACE_PROGRESS_MS, LAST_WORD_CAP } from './racePhraseFill.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'

// Проход 1 «Скажи» ПО ПОРЯДКУ и с откатом (журнал владельца v3.3.176, iPhone, «Nice to meet you»: первый черновик «meet» вместо «nice» засчитал «meet» навсегда — линия перепрыгнула
// его место, а когда ученик сказал «meet» по-настоящему, на экране ничего не изменилось): racePhraseScore.orderedHits, racePhraseListen.words (gone), racePhraseSaid.js, racePhraseSayView.js;
// продление у края в проходе 1, пока ученик продвигается (racePhraseFill.graceMs).
const W = ['nice', 'to', 'meet', 'you']
const bits = (words, heard) => orderedHits(words, heard).map(Number).join('')
const E = [0.38, 0.46, 0.63, 1] // границы слов «Nice to meet you» на пилюле (журнал: 0,38 после «nice», 0,63 после «meet»)

describe('orderedHits: слова цели только по возрастанию позиций', () => {
  it('«meet nice» и «to nice» — только «nice»; «meet» одно — слово 3 (его место решает префикс); полная фраза и сокращения — как раньше', () => {
    expect(bits(W, 'meet nice')).toBe('1000'); expect(bits(W, 'to nice')).toBe('1000'); expect(bits(W, 'meet')).toBe('0010')
    expect(bits(W, 'nice to meet you')).toBe('1111'); expect(bits(W, 'nice nice to')).toBe('1100'); expect(bits(W, '')).toBe('0000')
    expect(bits(["I'm", 'trying', 'to', 'learn'], 'i am trying to learn')).toBe('1111'); expect(bits(["I'm", 'trying', 'to', 'learn'], 'am trying')).toBe('1100')
  })
  it('зачёт прохода 1 по порядку: «meet nice to you» — не «чисто» (3 из 4), в проходе 2 — без порядка, как раньше', () => {
    expect(scorePhrases([P.meet], 'meet nice to you', true)[0].ratio).toBe(0.75)
    expect(pickPhrase(scorePhrases([P.meet], 'meet nice to you', true), false)).toBe(null)
    expect(scorePhrases([P.meet], 'meet nice to you')[0].ratio).toBe(1)
  })
})

/** Слушатель прохода 1 → слова хода (сцена) → вид (маска) и цель линии по границам E */
function chain() {
  const r = rig([P.meet, P.from], { wordByWord: true })
  const said = createSaid(), mask = mountMask(null, 'Nice to meet you'), sv = createSayView({ pass: 1, text: 'Nice to meet you', n: 4, mask })
  let seen = 0
  const pump = () => { for (const e of r.words.slice(seen)) if (e.phraseKey === P.meet.key) { said.word(e, 0); sv.word(e.index, said.heard(), 0, !!e.gone) } seen = r.words.length }
  const line = () => { pump(); return fillGoal({ words: said.fill(), n: 4, edges: E, done: r.got.length > 0 }) }
  const states = () => { pump(); return mask.words().map(w => w.state).join(' ') }
  return { r, said, line, states, sv }
}

describe('слушатель прохода 1: по порядку и откат', () => {
  it('журнал владельца: «meet» → «nice» → «nice to» → «nice to meet» → «nice to meet you» — линия 0 → 0,38 → 0,46 → 0,63 → 1, «meet» не белеет до своего места', async () => {
    const c = chain(); await flush()
    c.r.cur().cb.onPartial('meet'); expect(c.line()).toBe(0); expect(c.states()).toBe('full hidden hidden hidden') // ложное «meet»: не белое, подсказки нет
    c.r.cur().cb.onPartial('nice'); expect(c.line()).toBe(0.38); expect(c.states()).toBe('full peek hidden hidden')
    expect(c.r.words.slice(0, 3)).toEqual([{ phraseKey: P.meet.key, index: 2, text: 'meet', draft: true }, { phraseKey: P.meet.key, index: 2, text: 'meet', draft: true, gone: true }, { phraseKey: P.meet.key, index: 0, text: 'nice', draft: true }])
    expect(c.r.logs.some(s => /^\[phrase-ear\] слово 3 «meet» откат \(nice to meet you\): в услышанном по порядку его нет \+\d+ мс$/.test(s))).toBe(true)
    c.r.cur().cb.onPartial('nice to'); expect(c.line()).toBe(0.46); expect(c.states()).toBe('full full peek hidden') // раньше здесь 0,63: ложное «meet» засчитано
    c.r.cur().cb.onPartial('nice to meet'); expect(c.line()).toBe(0.63); expect(c.states()).toBe('full full full peek') // «meet» сказано — белеет и линия идёт
    c.r.cur().cb.onPartial('nice to meet you'); expect(c.r.got).toEqual([{ phraseKey: P.meet.key, ratio: 1, heard: 'nice to meet you' }]); expect(c.line()).toBe(1)
    c.r.l.stop()
  })
  it('черновик перестроился без слова — откат: кирпичик снова закрыт, подсказка и линия возвращаются на него', async () => {
    const c = chain(); await flush()
    c.r.cur().cb.onPartial('nice to'); expect(c.line()).toBe(0.46)
    c.r.cur().cb.onPartial('nice'); expect(c.line()).toBe(0.38); expect(c.states()).toBe('full peek hidden hidden'); expect(c.said.count()).toBe(1)
    expect(c.r.words.at(-1)).toMatchObject({ index: 1, gone: true })
    c.r.l.stop()
  })
  it('подтверждённое итогом слово не откатывается (прошлые заходы ушли из окна); итог со словом «вперёд» его не подтверждает', async () => {
    const c = chain(); await flush()
    c.r.cur().cb.onPartial('nice to'); await end(c.r, 'nice to', 10)
    expect(c.r.words.filter(e => !e.draft).map(e => e.index)).toEqual([0, 1])
    c.r.advance(JOIN_WBW_MS + 100); await flush()
    c.r.cur().cb.onPartial('meet'); expect(c.r.words.some(e => e.gone)).toBe(false); expect(c.line()).toBe(0.63) // «meet» после подтверждённых «nice to» — на своём месте
    c.r.l.stop()
    const q = chain(); await flush()
    await end(q.r, 'meet', 10); expect(q.r.words).toEqual([{ phraseKey: P.meet.key, index: 2, text: 'meet', draft: true }]) // шум итогом «meet» — не подтверждён (не на своём месте)
    q.r.cur().cb.onPartial('nice to'); expect(q.r.words.some(e => e.index === 2 && e.gone)).toBe(true); expect(q.line()).toBe(0.46)
    q.r.l.stop()
  })
  it('порядок: «to nice» — только «nice»; проход 2 — как раньше, без отката и без порядка', async () => {
    const c = chain(); await flush()
    c.r.cur().cb.onPartial('to nice'); expect(c.r.words.filter(e => e.phraseKey === P.meet.key).map(e => e.index)).toEqual([0]); expect(c.line()).toBe(0.38)
    c.r.l.stop()
    const two = rig([P.meet, P.from]); await flush()
    two.cur().cb.onPartial('meet'); two.cur().cb.onPartial('nice')
    expect(two.words.filter(e => e.phraseKey === P.meet.key)).toEqual([{ phraseKey: P.meet.key, index: 2, text: 'meet', draft: true }, { phraseKey: P.meet.key, index: 0, text: 'nice', draft: true }])
    two.l.stop()
  })
})

describe('сцена слушается отката (onWord с gone)', () => {
  it('«meet» вперёд — кирпичик и линия 0; «nice», откат «meet» — подсказка на «to»; «to», затем откат «to» — линия плавно назад к «nice», кирпичик снова закрыт', () => {
    const box = {}, listen = o => { box.o = o; return { setPhrases() {}, reset() {}, stop() {} } }
    const s = setupScene(phraseStep('phrases2', round2SayTurns(phrasesOf({ phrases: PHRASE_FIXTURE })), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED }), { listen, log: () => {} })
    for (let i = 0; i < 2000 && !s.pool.taken.length; i++) s.go(16)
    const p = s.pool.taken[0], key = s.run.api.state().pills[0].key, w = (index, gone = false) => box.o.onWord({ phraseKey: key, index, text: W[index], draft: true, ...(gone ? { gone } : {}) })
    const mask = () => s.run.api.state().mask.map(x => x.state).join(' ')
    w(2); s.go(300); expect(p.fill).toBe(0); expect(mask()).toBe('full hidden hidden hidden')
    w(2, true); w(0); s.go(300); expect(p.fill).toBeCloseTo(0.25, 2); expect(mask()).toBe('full peek hidden hidden')
    w(1); s.go(300); expect(p.fill).toBeCloseTo(0.5, 2); expect(mask()).toBe('full full peek hidden')
    w(1, true); s.go(16); expect(p.fill).toBeGreaterThan(0.4) // назад — плавно (вниз 1,2/с), не скачком
    s.go(300); expect(p.fill).toBeCloseTo(0.25, 2); expect(mask()).toBe('full peek hidden hidden')
    s.run.stop()
  })
})

describe('продление у края в проходе 1, пока ученик продвигается', () => {
  it('graceMs / edgeVerdict: проход 1 и слово не раньше 2,5 с до края (или во время продления) — 3 с; иначе и в проходе 2 — 1,5 с', () => {
    expect([LAST_WORD_GRACE_MS, LAST_WORD_GRACE_WBW_MS, GRACE_PROGRESS_MS]).toEqual([1500, 3000, 2500])
    expect(graceMs({ grace: 10000, wbw: true, last: 8196 })).toBe(3000) // журнал: «meet» за 1,8 с до края
    expect(graceMs({ grace: 10000, wbw: true, last: 7000 })).toBe(1500); expect(graceMs({ grace: 10000, wbw: false, last: 9900 })).toBe(1500); expect(graceMs({ grace: 10000, wbw: true })).toBe(1500)
    expect(edgeVerdict({ grace: 0, t: 2000, lit: 3, n: 4, canHold: true, wbw: true, last: -1000 })).toBe('wait')
    expect(edgeVerdict({ grace: 0, t: 3000, lit: 3, n: 4, canHold: true, wbw: true, last: -1000 })).toBe('draft')
    expect(edgeVerdict({ grace: 0, t: 2000, lit: 3, n: 4, canHold: true, last: -1000 })).toBe('draft')
  })
  it('сцена, журнал владельца: по слову с паузами ≈ 2,3 с, у края на 4-м слове — продление 3 с, «you» через 2 с после края — зачёт «чисто»', () => {
    const log = vi.fn(), s = setupScene(phraseStep('phrases2', round2SayTurns(phrasesOf({ phrases: PHRASE_FIXTURE })), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED }), { listen: createPhraseListener, log })
    for (let i = 0; i < 2000 && !s.pool.taken.length; i++) s.go(16)
    const p = s.pool.taken[0]
    s.go(3700); stubDraft('nice'); s.go(2300); stubDraft('nice to'); s.go(2300); stubDraft('nice to meet')
    for (let i = 0; i < 1000 && !p.held && !s.fx.fail.mock.calls.length; i++) s.go(16)
    expect(p.held).toBe(true)
    expect(log.mock.calls.map(c => c[0]).find(l => l.includes('продлён'))).toMatch(/ход продлён на 3000 мс \(черновик 75 %\)$/)
    s.go(2000); expect(s.fx.win).not.toHaveBeenCalled() // 1,5 с прошло — раньше здесь был зачёт «нечисто» по черновику
    stubSay('nice to meet you'); s.go(600)
    expect(s.fx.win).toHaveBeenCalledTimes(1); expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ok: true, ratio: 1, clean: true })
    expect(LAST_WORD_CAP).toBe(0.97)
    s.run.stop()
  })
})
