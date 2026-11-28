import { describe, it, expect, vi } from 'vitest'
import { setupScene } from './racePhraseSceneRig.js'
import { createPhraseListener, stubSay, stubDraft, stubLevel } from './racePhraseListenStub.js'
import { phraseStep, SAY_SPEED } from './raceStagesPhrases.js'
import { round2SayTurns } from './racePhraseTurns.js'
import { phrasesOf } from './racePhraseData.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { SPEED, LISTEN_Y_MAX } from '../player/modules/rotate-phone/wordLaneTimeline.js'

// Сцена широкой ленты без браузера: поддельный пул и часы — racePhraseSceneRig.js. Заливка «Скажи» — racePhraseFlow.test.js; тап-круги («Пойми», «Узнай») и их проверки вырезаны (владелец 2026-11-24)
const ph = phrasesOf({ phrases: PHRASE_FIXTURE })
const setup = setupScene

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
    stubSay('nice to you'); s.go(500); expect(s.fx.win).toHaveBeenCalledTimes(1); expect(p.fill).toBeCloseTo(0.5, 2) // принята по 3 словам из 4 («meet» пропущено) — заливка втыкается на пропущенном слове (граница после «to»), а не 80 % и не 100 % (владелец, 2026-11-28)
    expect(s.fx.win.mock.calls[0][2].res).toMatchObject({ ok: true, ratio: 0.75, clean: false })
    expect(p.attrs.has('data-partial')).toBe(true) // D: взлёт янтарным, не по всем словам
    s.run.stop()
  })
  it('data-mode="say", слушатель есть; маска слов «Nice ▭▭ ▭▭▭▭ ▭▭▭» снимается по onWord: услышанное (и черновиком) — целиком; подсказки нет до первого слова, дальше — строго следующее за сказанным; итог — вся фраза; журнал — круг 2 «Скажи» (голос)', () => {
    const log = vi.fn(); const s = setup(say(), { listen: createPhraseListener, log })
    s.go(16)
    const m = () => s.run.api.state().mask.map(w => `${w.text.replaceAll('\u2007', '▭')}:${w.state}`).join(' ')
    expect(m()).toBe('Nice:full ▭▭:hidden ▭▭▭▭:hidden ▭▭▭:hidden') // первый кадр пилюли: первое слово открыто, остальные — кирпичики, подсказки нет (решение владельца 2026-11-09)
    s.go(584)
    expect(s.run.api.state().listening).toBe(true); expect(s.pool.taken[0].vals['data-mode']).toBe('say')
    stubLevel(0.05); expect(m()).toBe('Nice:full ▭▭:hidden ▭▭▭▭:hidden ▭▭▭:hidden') // голос без слов — подсказки нет
    stubDraft('nice'); expect(m()).toBe('Nice:full to:peek ▭▭▭▭:hidden ▭▭▭:hidden') // сказано слово 1 — только теперь проявляется слово 2
    stubDraft('nice to'); expect(m()).toBe('Nice:full to:full meet:peek ▭▭▭:hidden') // сказано подсказанное — целиком белое (и черновиком), подсказка — следующее
    stubDraft('nice to meet'); expect(m()).toBe('Nice:full to:full meet:full you:peek')
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
