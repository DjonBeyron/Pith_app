import { describe, it, expect } from 'vitest'
import { strictHits, scorePhrases } from './racePhraseScore.js'
import { rig, P, flush, end } from './racePhraseListenRig.js'
import { createSaid } from './racePhraseSaid.js'
import { createSayView } from './racePhraseSayView.js'
import { mountMask } from './racePhraseMaskView.js'

// Правило владельца для прохода 1 «Скажи» (v3.3.306), фраза «Where are you from»:
//  • «where» сказано — линия встала между «where» и «are»; неверное слово вместо «are» — линия дёрнулась и вернулась; «are» горит красным;
//  • сколько бы раз ни сказали неверно — дальше не идёт, даже если после неверного сказано следующее верное «you»;
//  • сказали «are» — белеет, линия между «are» и «you» (а не после ранее сказанного «you»);
//  • защита: быстро всё сразу «where is you from» — линия всё равно встаёт перед неверным словом.
const W = ['Where', 'are', 'you', 'from']
const bits = (heard, base = 0) => strictHits(W, heard, base).map(Number).join('')

describe('strictHits: слово засчитывается, только если оно ожидаемое', () => {
  it('«where is you from» — только «where»; «where you» — только «where»; «you from» с нуля — ничего', () => {
    expect(bits('where is you from')).toBe('1000'); expect(bits('where you')).toBe('1000'); expect(bits('you from')).toBe('0000'); expect(bits('where')).toBe('1000')
  })
  it('верные слова подряд — все; неверное между верными пропускается: «where is are you from» → where, are, you, from', () => {
    expect(bits('where are you from')).toBe('1111'); expect(bits('where is are you from')).toBe('1111'); expect(bits('where are from')).toBe('1100')
  })
  it('прошлые заходы (base): «where» подтверждено, в окне «where you» + «are» → «are» и стоп перед «you»', () => {
    expect(bits('where you are', 1)).toBe('1100'); expect(bits('where is you from are', 1)).toBe('1100'); expect(bits('you', 2)).toBe('1110')
  })
  it('сокращения как раньше: «I\'m trying» из «i am trying»; доля — по словам цели', () => {
    expect(strictHits(["I'm", 'trying', 'to', 'learn'], 'i am trying').map(Number).join('')).toBe('1100')
    expect(scorePhrases([{ key: 'k', words: W }], 'where is you from', { strict: true, base: () => 0 })[0].ratio).toBe(0.25)
  })
})

/** Слушатель прохода 1 → слова хода → маска и вид «Скажи» */
function scene() {
  const r = rig([P.from], { wordByWord: true })
  const said = createSaid(), mask = mountMask(null, 'Where are you from'), jerks = []
  const sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, nudge: on => on && jerks.push(1), el: null })
  let seen = 0
  const pump = () => { for (const e of r.words.slice(seen)) { said.word(e, 0); sv.word(e.index, said.heard(), 0, !!e.gone) } seen = r.words.length }
  const ear = (kind, text) => { r.cur().cb[kind === 'partial' ? 'onPartial' : 'onResult'](text, { words: [] }) }
  const frame = t => { pump(); sv.ear({ kind: 'partial', text: '' }); sv.frame(t, false, 0.3) }
  return { r, said, mask, sv, jerks, pump, ear, frame, states: () => mask.words().map(w => w.state).join(' '), idx: () => [...new Set(r.words.filter(w => !w.gone).map(w => w.index))] }
}

describe('сценарий владельца на слушателе прохода 1', () => {
  it('«where» → неверное вместо «are» → «you» после неверного не запоминается → «are»: слова только 0 и 1, «you» заново', async () => {
    const c = scene(); await flush()
    c.ear('partial', 'where'); c.pump(); expect(c.idx()).toEqual([0]); expect(c.states()).toBe('full peek hidden hidden') // подсказка — у следующего ожидаемого слова
    await end(c.r, 'where', 10); await flush()
    c.ear('partial', 'is'); c.pump(); expect(c.idx()).toEqual([0]) // неверное слово: ничего не засчитано
    c.ear('partial', 'you'); c.pump(); expect(c.idx()).toEqual([0]) // верное «you» ПОСЛЕ неверного — линию не двигает и не запоминается
    c.ear('partial', 'are'); c.pump(); expect(c.idx()).toEqual([0, 1]) // «are» сказано — только оно
    expect(c.r.words.some(w => w.index === 2 && !w.gone)).toBe(false)
    c.r.l.stop()
  })
  it('защита: «where is you from» одним заходом — засчитано только «where», «you» и «from» не запомнены; после «are» — линия между «are» и «you»', async () => {
    const c = scene(); await flush()
    c.ear('partial', 'where is you from'); c.pump(); expect(c.idx()).toEqual([0])
    await end(c.r, 'where is you from', 10); await flush(); c.pump()
    expect(c.r.words.filter(w => !w.gone && !w.draft).map(w => w.index)).toEqual([0]) // итог подтверждает только «where»
    c.ear('partial', 'are'); c.pump(); expect(c.idx()).toEqual([0, 1]); expect(c.r.words.some(w => w.index >= 2 && !w.gone)).toBe(false)
    c.r.l.stop()
  })
})

describe('вид хода: красное ожидаемое слово и рывок на каждое неверное слово', () => {
  it('«you» вместо «are» и «is» вместо «are» — «are» красным, рывок кромки; повтор через паузу — рывок снова; сказано «are» — красное снимается', () => {
    const jerks = [], mask = mountMask(null, 'Where are you from')
    const sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, nudge: on => on && jerks.push(1), el: null })
    sv.word(0, new Map([[0, true]]), 0); mask.set(new Map([[0, true]]))
    sv.ear({ kind: 'partial', text: 'where is' }); sv.frame(1000, false, 0.3); sv.frame(1300, false, 0.3)
    expect(mask.words()[1].state).toBe('miss'); expect(jerks.length).toBe(1)
    sv.ear({ kind: 'partial', text: 'where is you' }); sv.frame(2300, false, 0.3); sv.frame(2600, false, 0.3)
    expect(mask.words()[1].state).toBe('miss'); expect(jerks.length).toBe(2)
    sv.word(1, new Map([[0, true], [1, true]]), 3000); expect(mask.words()[1].state).not.toBe('miss')
  })
})

describe('журнал владельца 15:12: слова «вперёд» из прошлых заходов не засчитываются задним числом', () => {
  it('«where», потом «you», «you from» (до «are»), потом «are» и «where» новым заходом — фраза НЕ засчитана, слова 3 и 4 не пришли', async () => {
    const r = rig([P.from], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where'); await end(r, 'where', 300)
    r.cur().cb.onPartial('you'); await end(r, 'you', 300)
    r.cur().cb.onPartial('you from'); await end(r, 'you from', 300)
    r.cur().cb.onPartial('are'); await end(r, 'are', 300)
    r.cur().cb.onPartial('where') // новый заход: ничего нового сказано не было
    expect(r.got).toEqual([])
    const idx = r.words.filter(w => !w.gone).map(w => w.index)
    expect(idx).not.toContain(2); expect(idx).not.toContain(3)
    // а теперь «you from» говорят по-настоящему, после «are» — засчитано
    await end(r, 'where', 300)
    r.cur().cb.onPartial('you from'); await end(r, 'you from', 300)
    expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })
})

describe('громкое «is» вместо «are»: Vosk отдаёт его как «[unk]» — это неверное слово (только после настоящего слова захода)', () => {
  it('«where [unk]» → красное «are» и рывок (раньше [unk] отбрасывался, и «where is» молча оставалось без реакции)', () => {
    const mask = mountMask(null, 'Where are you from'), jerks = []
    const sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, nudge: on => on && jerks.push(1), el: null })
    sv.word(0, new Map([[0, true]]), 0); mask.set(new Map([[0, true]]))
    sv.ear({ kind: 'partial', text: 'where', raw: 'where [unk]' }); sv.frame(1000, false, 0.3); sv.frame(1300, false, 0.3)
    expect(mask.words()[1].state).toBe('miss'); expect(jerks.length).toBe(1)
  })
})

describe('рывок: короткая красная жидкость (v3.3.309: «амплитуда огромная — гораздо меньше»)', () => {
  it('fire(from) пишет --nf и постоянную короткую длину --nw (NUDGE_EXTRA % ширины, не до 90 %); CSS — анимация wlNudgeFill 0,4 с', async () => {
    const { createNudge, NUDGE_MS, NUDGE_EXTRA } = await import('./racePhraseNudge.js')
    const vars = {}, el = { style: { setProperty: (k, v) => { vars[k] = v } }, addEventListener() {}, removeEventListener() {} }
    const n = createNudge({ mark() {}, el, setTimer: () => 1, clearTimer() {} })
    n.fire(0.36); expect(vars).toEqual({ '--nf': '36', '--nw': String(NUDGE_EXTRA) }); n.fire(0.95); expect(vars['--nw']).toBe(String(NUDGE_EXTRA))
    expect(NUDGE_EXTRA).toBeLessThanOrEqual(10); expect(NUDGE_MS).toBe(400)
    const css = (await import('node:fs')).readFileSync(new URL('../../styles/player/modules/word-lane-wide-fill.css', import.meta.url), 'utf8')
    expect(css).toContain('@keyframes wlNudgeFill'); expect(css).toContain('@keyframes wlNudgeInk'); expect(css).toContain('animation: wlNudgeFill 0.4s both'); expect(css).toContain('var(--nw, 7)'); expect(css).not.toContain('.wlPillSparks::before')
  })
})

describe('одинокий «[unk]» — шум, не неверное слово (журнал 15:27: красное и рывок из тишины)', () => {
  it('«[unk]» без слова перед ним и «[unk] [unk]» — ничего; «where [unk]» — красное «are»', () => {
    const run = raw => { const mask = mountMask(null, 'Where are you from'), jerks = [], sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, nudge: on => on && jerks.push(1), el: null }); sv.ear({ kind: 'partial', text: '', raw }); sv.frame(1000, false, 0); sv.frame(1300, false, 0); return [mask.words()[0].state, jerks.length] }
    expect(run('[unk]')).toEqual(['full', 0]); expect(run('[unk] [unk]')).toEqual(['full', 0])
    expect(run('where [unk]')[1]).toBe(1)
  })
})

describe('журнал для разбора «что пошло не так» (v3.3.313)', () => {
  it('рывок: журнал «рывок кромки» с причиной и заливкой; повтор раньше WRONG_GAP_MS — «рывок пропущен»; проход 2 — «рывка нет»', () => {
    const mk = pass => { const logs = [], mask = mountMask(null, 'Where are you from'), sv = createSayView({ pass, text: 'Where are you from', n: 4, mask, nudge: () => {}, el: null, log: l => logs.push(l) }); sv.word(0, new Map([[0, true]]), 0); return { logs, sv } }
    const a = mk(1); a.sv.ear({ kind: 'partial', text: 'where', raw: 'where [unk]' }); a.sv.frame(1000, false, 0.41); a.sv.frame(1300, false, 0.41)
    expect(a.logs.some(l => /рывок кромки: .*«\[unk\]», заливка 0,41/.test(l))).toBe(true)
    a.sv.ear({ kind: 'partial', text: 'where', raw: 'where [unk] [unk]' }); a.sv.frame(1700, false, 0.41); a.sv.frame(1900, false, 0.41)
    expect(a.logs.some(l => l.includes('рывок пропущен'))).toBe(true)
    const b = mk(2); b.sv.ear({ kind: 'partial', text: 'where', raw: 'where [unk]' }); b.sv.frame(1000, false, 0.41); b.sv.frame(1300, false, 0.41)
    expect(b.logs.some(l => l.includes('рывка нет (проход 2)'))).toBe(true)
  })
  it('красное снимается — в журнале «красное «are» снято: слово сказано»', () => {
    const logs = [], mask = mountMask(null, 'Where are you from'), sv = createSayView({ pass: 1, text: 'Where are you from', n: 4, mask, log: l => logs.push(l) })
    sv.word(0, new Map([[0, true]]), 0); sv.ear({ kind: 'wrong', why: 'voice' }); sv.frame(1000, false, 0.4); sv.word(1, new Map([[0, true], [1, true]]), 2000)
    expect(logs.some(l => l.includes('красное «are» снято'))).toBe(true)
  })
  it('рывок проверяет, что анимация запущена (getAnimations): 0 — «НЕ ЗАПУСТИЛАСЬ»', async () => {
    const { createNudge } = await import('./racePhraseNudge.js'), logs = [], timers = []
    const el = { style: { setProperty() {} }, getAnimations: () => [], addEventListener() {}, removeEventListener() {} }
    createNudge({ mark() {}, el, log: l => logs.push(l), setTimer: fn => { timers.push(fn); return 1 }, clearTimer() {} }).fire(0.4)
    timers.forEach(f => f()); expect(logs.some(l => l.includes('НЕ ЗАПУСТИЛАСЬ'))).toBe(true)
  })
})
