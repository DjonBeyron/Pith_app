import { describe, it, expect, vi } from 'vitest'
import { CENTER_Y, HOT_MS } from './racePhraseScene.js'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft, stubCount } from './racePhraseListenStub.js'
import { phraseStep, PHRASE_SPEED, SAY_SPEED, PHRASE_GAP_MS } from './raceStagesPhrases.js'
import { round1Turns, round2SayTurns, round2HearTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { SPEED, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Сцена широкой ленты без браузера: поддельный пул и часы — racePhraseSceneRig.js. Единый конвейер круга 1 и заливка «Скажи» — racePhraseFlow.test.js
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const setup = setupScene
const pick = (voice = false) => { const t = round1Turns(ph, 's1'); return phraseStep('phrases1', t, { round: 1, mode: 'pick', voice, speed: PHRASE_SPEED }) }
/** Ждать, пока пилюля key окажется у центра */
const untilCenter = (s, key) => { for (let i = 0; i < 2000; i++) { const p = s.run.api.state().pills.find(x => x.key === key); if (p && Math.abs(p.y - CENTER_Y) < 3) return p; s.go(16) } return null }

describe('сцена широкой ленты: круг 1 «Пойми»', () => {
  it('ход: pre (Пит говорит смысл), три широкие пилюли ОДНА ЗА ДРУГОЙ через PHRASE_GAP_MS, по центру одной ленты', () => {
    const s = setup(pick())
    s.go(100)
    expect(s.fx.pre).toHaveBeenCalledTimes(1); expect(s.fx.pre.mock.calls[0][0].rep.target.key).toBe(ph[0].key)
    s.go(400)
    expect(s.pool.taken).toHaveLength(1)
    s.go(PHRASE_GAP_MS); expect(s.pool.taken).toHaveLength(2)
    s.go(PHRASE_GAP_MS); expect(s.pool.taken).toHaveLength(3)
    for (const p of s.pool.taken) { expect(p.wide).toBe(true); expect(p.lane).toBe(1); expect(p.speed).toBe(PHRASE_SPEED); expect(p.quiet).toBe(true) }
    expect(s.pool.taken.map(p => p.cap)).toEqual(round1Turns(ph, 's1')[0].cands.map(c => c.cap))
  })
  it('пилюля в зоне чтения ≈ 4,5 с (круг 1, «Узнай») и ≈ 7 с («Скажи»); кандидаты через gap: целиком на экране не больше двух', () => {
    const zone = v => 50 / (SPEED * v) // зона чтения ≈ 22…72 % высоты
    expect(zone(PHRASE_SPEED)).toBeGreaterThanOrEqual(4.3); expect(zone(PHRASE_SPEED)).toBeLessThanOrEqual(4.7)
    expect(zone(SAY_SPEED)).toBeGreaterThanOrEqual(6.7); expect(zone(SAY_SPEED)).toBeLessThanOrEqual(7.4)
    const step = (SPEED * PHRASE_SPEED * PHRASE_GAP_MS) / 1000 // шаг между кандидатами, % высоты
    expect(2 * step).toBeGreaterThan(100 - 11) // три целиком (центры в 5,5…94,5 %) не помещаются
  })
  it('Пит ещё говорит — пилюли не выезжают', () => {
    const s = setup(pick(), { pit: 500 })
    s.go(3000); expect(s.pool.taken).toHaveLength(0)
  })
  it('тап по ленте берёт пилюлю ближе всего к центру: верная — зачёт и взлёт (fx.win с итогом хода), журнал [phrases]', () => {
    const log = vi.fn(); const s = setup(pick(), { log }); const t = round1Turns(ph, 's1')[0]
    s.go(500)
    expect(untilCenter(s, t.target.key)).toBeTruthy()
    s.run.api.tap(0)
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    const rep = s.fx.win.mock.calls[0][2]
    expect(rep).toMatchObject({ last: true, count: 1, round: 1, phraseKey: t.target.key, res: { ok: true, late: false } })
    expect(s.pool.taken.find(p => p.cap === t.target.text).rose).toBe(true)
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[phrases\] круг 1 «Пойми» \(тап фразы\), ход 1\/3: цель «.+» кандидаты «.+» \| «.+» \| «.+» итог верно; остальные едут: \d$/)
  })
  it('тап по чужой — дрожь, fx.miss с «с чем спутал», верная подсвечена и взлетает сама; чужая не гаснет, а едет дальше отыгранной', () => {
    const s = setup(pick())
    s.go(500)
    const t0 = round1Turns(ph, 's1')[0], wrong = t0.cands.find(c => !c.right)
    expect(untilCenter(s, wrong.key)).toBeTruthy()
    s.run.api.tap(2)
    expect(s.fx.miss).toHaveBeenCalledTimes(1)
    expect(s.fx.miss.mock.calls[0][0].rep.res).toMatchObject({ ok: false, confusedWith: wrong.key })
    const right = s.pool.taken.find(p => p.cap === t0.target.text)
    expect(right.attrs.has('data-hot')).toBe(true)
    const shaken = s.pool.taken.find(p => p.cap === wrong.cap)
    expect(s.pool.live.has(shaken.k)).toBe(true); expect(shaken.attrs.has('data-spent')).toBe(true); expect(shaken.faded).toBeUndefined()
    return new Promise(r => setTimeout(r, HOT_MS + 50)).then(() => { expect(right.rose).toBe(true); expect(s.pool.live.has(shaken.k)).toBe(true) })
  })
  it('верная ушла — «не успел» (fx.fail); все ходы — fx.finished', () => {
    const s = setup(pick())
    s.go(70000)
    expect(s.fx.fail).toHaveBeenCalledTimes(3); expect(s.fx.finished).toHaveBeenCalledTimes(1)
    expect(s.fx.fail.mock.calls.map(c => c[0].rep.res.ok)).toEqual([false, false, false])
  })
  it('круг 1 — только тап: слушатель фраз не создаётся даже при voice (голосом), сказанная фраза не засчитывается; пилюли с полным текстом, data-mode="pick"', () => {
    const n = stubCount()
    const s = setup(pick(true), { listen: createPhraseListener }); const t0 = round1Turns(ph, 's1')[0]
    expect(stubCount()).toBe(n); expect(s.run.api.state().listening).toBe(false)
    s.go(600)
    stubSay(t0.target.text)
    expect(s.fx.win).not.toHaveBeenCalled()
    for (const p of s.pool.taken) { expect(p.vals['data-mode']).toBe('pick'); expect(p.attrs.has('data-faded')).toBe(false); expect(t0.cands.map(c => c.cap)).toContain(p.cap) }
    expect(untilCenter(s, t0.target.key)).toBeTruthy(); s.run.api.tap()
    expect(s.fx.win).toHaveBeenCalledTimes(1)
    s.run.stop()
  })
  it('круг 2 «Узнай» (пальцами): data-mode="hear", слушателя нет, журнал — круг 2 «Узнай» (тап смысла)', () => {
    const log = vi.fn(); const t = round2HearTurns(ph, 's1')
    const s = setup(phraseStep('phrases2', t, { round: 2, mode: 'hear', voice: false, speed: PHRASE_SPEED }), { log, listen: createPhraseListener })
    s.go(500)
    expect(s.run.api.state().listening).toBe(false); expect(s.pool.taken[0].vals['data-mode']).toBe('hear')
    expect(untilCenter(s, t[0].target.key)).toBeTruthy(); s.run.api.tap()
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[phrases\] круг 2 «Узнай» \(тап смысла\), ход 1\/\d: цель/)
    s.run.stop()
  })
})

describe('сцена широкой ленты: круг 2 «Скажи»', () => {
  const say = () => phraseStep('phrases2', round2SayTurns(ph), { round: 2, mode: 'say', voice: true, speed: SAY_SPEED })
  it('одна бледная пилюля, без сегментов, заливка одна на всю фразу; ratio ≥ 0,75 — зачёт, нечисто при пропущенном слове', () => {
    const s = setup(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0]
    expect(s.pool.taken).toHaveLength(1); expect(p.attrs.has('data-faded')).toBe(true); expect(p.segs).toBeUndefined(); expect(p.wide).toBe(true)
    stubSay('nice to'); s.go(600); expect(p.fill).toBeCloseTo(0.5, 2) // два слова — две полные доли, «аванс» после первого слова не перелетает
    s.go(1400); expect(p.fill).toBeCloseTo(0.5, 2)
    expect(s.fx.win).not.toHaveBeenCalled()
    stubSay('nice to you'); s.go(16); expect(s.fx.win).not.toHaveBeenCalled() // итог: заливка сначала доезжает до 100 %
    s.go(500); expect(s.fx.win).toHaveBeenCalledTimes(1); expect(p.fill).toBe(1)
    expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ok: true, ratio: 0.75, clean: false })
    s.run.stop()
  })
  it('data-mode="say", слушатель есть; маска слов «Nice ▭▭ ▭▭▭▭ ▭▭▭» снимается по onWord: черновик — бледно (draft), подтверждение — целиком; итог — вся фраза; журнал — круг 2 «Скажи» (голос)', () => {
    const log = vi.fn(); const s = setup(say(), { listen: createPhraseListener, log })
    s.go(600)
    expect(s.run.api.state().listening).toBe(true); expect(s.pool.taken[0].vals['data-mode']).toBe('say')
    const m = () => s.run.api.state().mask.map(w => `${w.text.replaceAll('\u2007', '▭')}:${w.state}`).join(' ')
    expect(m()).toBe('Nice:full ▭▭:hidden ▭▭▭▭:hidden ▭▭▭:hidden') // первое слово открыто, «to» второе — спрятано
    stubDraft('nice to'); expect(m()).toBe('Nice:full to:draft ▭▭▭▭:hidden ▭▭▭:hidden')
    stubDraft('nice to meet'); expect(m()).toBe('Nice:full to:full meet:draft ▭▭▭:hidden') // прошлое слово подтверждено следующим
    stubSay('nice to meet you'); expect(m()).toBe('Nice:full to:full meet:full you:full') // итог: вся фраза сразу, взлёт — когда заливка доехала
    s.go(700); expect(s.fx.win).toHaveBeenCalledTimes(1)
    expect(log.mock.calls.at(-1)[0]).toMatch(/^\[phrases\] круг 2 «Скажи» \(голос\), ход 1\/6, проход 1\/2: цель .+ итог верно, слова 100 %, чисто$/)
    s.run.stop()
  })
  it('чисто — все слова; тап в «Скажи» не отвечает', () => {
    const s = setup(say(), { listen: createPhraseListener })
    s.go(600); s.run.api.tap(1); expect(s.fx.win).not.toHaveBeenCalled()
    stubSay('nice to meet you'); s.go(700); expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ratio: 1, clean: true })
    s.run.stop()
  })
  it('пилюля едет с постоянной скоростью SAY_SPEED — тишина её не ускоряет (раньше ×2 после 3 с), слово не замедляет; ушла — fail с долей слов', () => {
    const s = setup(say(), { listen: createPhraseListener })
    s.go(600)
    const p = s.pool.taken[0], ys = []
    for (let i = 0; i < 8; i++) { ys.push(s.pool.y(p.k)); s.go(1000); if (i === 5) stubSay('nice') }
    const v = ys.slice(1).map((y, i) => y - ys[i]) // % за секунду
    for (const d of v) expect(d).toBeCloseTo(SPEED * SAY_SPEED, 1)
    expect(p.rate).toBe(1)
    s.go(30000)
    expect(s.fx.fail).toHaveBeenCalled(); expect(s.fx.fail.mock.calls[0][0].rep.res.ratio).toBe(0.25)
    expect(LISTEN_Y_MAX).toBeGreaterThan(90)
    s.run.stop()
  })
})
