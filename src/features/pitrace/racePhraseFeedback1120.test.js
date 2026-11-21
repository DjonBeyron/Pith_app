import { describe, it, expect } from 'vitest'
import { strictHits } from './racePhraseScore.js'
import { rig, flush, end } from './racePhraseListenRig.js'
import { createWrongWord, TAIL_STABLE_MS } from './racePhraseWrongWord.js'
import { TAIL_HOLD_MS } from './racePhraseTailHold.js'
import { UNK_FINAL_MS } from './racePhraseListen.js'

// Журнал владельца 2026-11-20 (v3.3.313, iPhone, «Подборка 24 фразы · по словам»), пункты 7, 11, 12 его списка.
const PARK = { key: 'park', words: ["Let's", 'go', 'to', 'the', 'park', 'tomorrow'] }
const LOVE = { key: 'love', words: ['I', 'love', 'you'] }
const bits = (words, heard, base = 0) => strictHits(words, heard, base).map(Number).join('')

describe('п. 12: быстрое «to to to to» Vosk отдал как «to the to to» — линия перескочила два слова', () => {
  it('strictHits: слово, за которым сразу идёт повтор уже сказанного слова, не засчитывается; честные «to the» и «to the park» — как раньше', () => {
    expect(bits(PARK.words, 'to the to to', 2)).toBe('111000')
    expect(bits(PARK.words, 'to the to', 2)).toBe('111000')
    expect(bits(PARK.words, 'to the', 2)).toBe('111100'); expect(bits(PARK.words, 'to the park', 2)).toBe('111110')
    expect(bits(['Where', 'are', 'you', 'from'], 'where are from')).toBe('1100'); expect(bits(['Where', 'are', 'you', 'from'], 'where are is')).toBe('1100')
    expect(bits(['I', 'want', 'to', 'go', 'to', 'school'], 'i want to go to school')).toBe('111111') // слово фразы, повторённое в ней самой, — не «повтор»
  })
  it('слушатель: после «let\'s go» черновик «to the to» и итог «to the to to» дают только «to»', async () => {
    const r = rig([PARK], { wordByWord: true }); await flush()
    r.cur().cb.onPartial("let's go"); await end(r, "let's go", 10)
    r.cur().cb.onPartial('to the to'); await end(r, 'to the to to', 10)
    const alive = new Set(); for (const w of r.words) { if (w.gone) alive.delete(w.index); else alive.add(w.index) } // v3.3.319: черновик «to the to» «the» ещё держит (повтор последним словом), итог «to the to to» его снимает
    expect([...alive]).toEqual([0, 1, 2])
    r.l.stop()
  })
})

describe('п. 7: «слишком предсказывает, особенно в последнем слове» — последнее слово фразы черновиком ждёт устойчивости', () => {
  it('«i love» подтверждено; черновик «you» — фраза не закрыта; через TAIL_HOLD_MS слушатель просит итог, и только итог «you» её закрывает; середина фразы — без задержки', async () => {
    const r = rig([LOVE], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('i'); expect(r.words.map(w => w.index)).toEqual([0]) // первое слово — сразу
    await end(r, 'i', 10); r.cur().cb.onPartial('love'); expect(r.words.some(w => w.index === 1)).toBe(true); await end(r, 'love', 10)
    r.cur().cb.onPartial('you'); expect(r.got).toEqual([]); expect(r.words.some(w => w.index === 2)).toBe(false)
    r.advance(TAIL_HOLD_MS - 50); expect(r.got).toEqual([])
    r.advance(50); expect(r.got).toEqual([]); expect(r.cur().stopped).toBe(1) // v3.3.317: устоялось — просим итог, сами не засчитываем
    r.cur().cb.onResult('you', { words: [] }); expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })
  it('черновик «you» переписан за 200 мс на «love» — последнее слово не засчитано вовсе; итог захода «you» засчитывает сразу', async () => {
    const r = rig([LOVE], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('i'); await end(r, 'i', 10); r.cur().cb.onPartial('love'); await end(r, 'love', 10)
    r.cur().cb.onPartial('you'); r.advance(200); r.cur().cb.onPartial('love'); r.advance(1000)
    expect(r.got).toEqual([]); expect(r.words.some(w => w.index === 2)).toBe(false)
    await end(r, 'love', 10); r.cur().cb.onPartial('you'); r.cur().cb.onResult('you', { words: [] })
    expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })
})

describe('п. 11 и ложное красное: неверное слово по черновику', () => {
  it('первый черновик «is» переписан на «the» через 260 мс (журнал 291337 → 291596) — красного нет', () => {
    const w = createWrongWord({ words: ['The', 'weather', 'is', 'very'] }), said = new Map()
    w.ear({ kind: 'partial', text: 'is' }); w.check(said, 0); expect(w.shown()).toBeNull()
    w.check(said, 250); expect(w.shown()).toBeNull() // раньше (200 мс) здесь уже было красное
    w.ear({ kind: 'partial', text: 'the' }); said.set(0, false); w.check(said, 260); w.check(said, 260 + TAIL_STABLE_MS); expect(w.shown()).toBeNull()
  })
  it('повтор уже сказанного «to» вместо «tomorrow» (журнал 1140970: молчало 3,3 с до итога) — красное по устойчивому черновику', () => {
    const w = createWrongWord({ words: PARK.words }), said = new Map([[0, true], [1, true], [2, true], [3, true]])
    w.ear({ kind: 'partial', text: 'park' }); said.set(4, false); w.check(said, 0)
    w.ear({ kind: 'final', text: 'park' }); w.check(said, 100); expect(w.shown()).toBeNull() // «park» сказано в этом заходе — не повтор
    w.ear({ kind: 'partial', text: 'to' }); w.check(said, 1000); expect(w.shown()).toBeNull()
    w.check(said, 1000 + TAIL_STABLE_MS); expect(w.shown()).toBe('to')
  })
  it('слово, сказанное в ЭТОМ же заходе, красным не становится: «where» → «where are»', () => {
    const w = createWrongWord({ words: ['Where', 'are', 'you', 'from'] }), said = new Map()
    w.ear({ kind: 'partial', text: 'where' }); said.set(0, false); w.check(said, 0); w.check(said, 400); expect(w.shown()).toBeNull()
    w.ear({ kind: 'partial', text: 'where are' }); said.set(1, false); w.check(said, 500); w.check(said, 900); expect(w.shown()).toBeNull()
  })
})

describe('журнал 22:48 (v3.3.314): «первое слово не засчитывалось вообще, потом засчитало сразу два слова»', () => {
  it('чужое слово («[unk]»), потом «where» в том же заходе: черновиком не принимаем, но через UNK_FINAL_MS просим итог — «where» засчитано одно, без «are»', async () => {
    const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
    const r = rig([FROM], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('[unk]'); r.cur().cb.onPartial('[unk] where')
    expect(r.words).toEqual([]); expect(r.cur().stopped).toBe(0)
    r.advance(UNK_FINAL_MS - 10); expect(r.cur().stopped).toBe(0)
    r.advance(10); expect(r.cur().stopped).toBe(1) // раньше заход висел, пока Vosk сам не закроет: 13 с повторов «where»
    expect(r.logs.some(l => l.includes('прошу итог захода'))).toBe(true)
    await end(r, '[unk] where', 10)
    expect(r.words.filter(w => !w.gone).map(w => w.index)).toEqual([0])
    r.l.stop()
  })
})

describe('журнал 23:18 (v3.3.315): «первое слово само засчитала» — Vosk прочитал фон комнаты 0,007–0,011 как «where»', () => {
  const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
  it('фон выше старого порога 0,008, голоса в заходе нет — «where» не принято ни черновиком, ни итогом, красного «голос без слова» тоже нет', async () => {
    const r = rig([FROM], { wordByWord: true }); await flush()
    for (const v of [0.0069, 0.007, 0.0089, 0.0066, 0.0091, 0.0076, 0.0107, 0.0112]) r.cur().cb.onLevel(v) // уровни из журнала 36996–37892
    r.cur().cb.onPartial('where'); expect(r.words).toEqual([])
    expect(r.logs.some(l => l.includes('это шум, не речь'))).toBe(true)
    await end(r, '', 10); expect(r.hears.some(h => h.kind === 'wrong')).toBe(false)
    r.l.stop()
  })
  it('тот же фон, потом речь 0,11–0,15 — «where» принято', async () => {
    const r = rig([FROM], { wordByWord: true }); await flush()
    for (const v of [0.0069, 0.007, 0.0089, 0.0094, 0.1136, 0.1482, 0.0697]) r.cur().cb.onLevel(v)
    r.cur().cb.onPartial('where'); expect(r.words.map(w => w.index)).toEqual([0])
    r.l.stop()
  })
})

describe('журнал 23:26 (v3.3.316): сказал «фриз» вместо «from» — черновик «you from», фраза засчитана', () => {
  it('черновик «you from» устоялся — фраза НЕ засчитана, просим итог; итог «you [unk]» — «from» не сказано, фраза открыта, слух шлёт неверное слово', async () => {
    const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
    const r = rig([FROM], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where are you'); await end(r, 'where are you', 10)
    r.cur().cb.onPartial('you'); r.cur().cb.onPartial('you from'); r.advance(TAIL_HOLD_MS + 500)
    expect(r.got).toEqual([]); expect(r.words.some(w => w.index === 3)).toBe(false); expect(r.cur().stopped).toBeGreaterThan(0)
    r.cur().cb.onResult('you [unk]', { words: [] })
    expect(r.got).toEqual([]); expect(r.words.some(w => w.index === 3)).toBe(false)
    r.l.stop()
  })
})

describe('журнал 10:23 (v3.3.317): «я точно сказал некоторые слова иначе, а он засчитал» — черновик «you» через 200 мс стал «[unk]», итог «[unk]», а «you» осталось', () => {
  it('черновое слово, которое Vosk переписал на «[unk]», откатывается и через 1 с не подтверждается; итог «[unk]» — неверное слово', async () => {
    const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
    const r = rig([FROM], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where are'); await end(r, 'where are', 10)
    for (const v of [0.001, 0.15, 0.16]) r.cur().cb.onLevel(v)
    r.cur().cb.onPartial('you'); expect(r.words.at(-1)).toMatchObject({ index: 2, draft: true })
    r.advance(200); r.cur().cb.onPartial('[unk]')
    expect(r.words.at(-1)).toMatchObject({ index: 2, gone: true })
    r.advance(3000); r.cur().cb.onResult('[unk]', { words: [] }); r.advance(10); await flush()
    expect(r.words.some(w => w.index === 2 && !w.draft && !w.gone)).toBe(false) // «продержалось 1000 мс — подтверждено» не случилось
    expect(r.hears.some(h => h.kind === 'wrong')).toBe(true)
    r.l.stop()
  })
  it('итог «[unk]» без переписанного черновика тоже откатывает черновое слово захода; честно пустой итог «» — не откатывает (v3.3.283)', async () => {
    const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
    const a = rig([FROM], { wordByWord: true }); await flush()
    a.cur().cb.onPartial('where'); a.cur().cb.onResult('[unk]', { words: [] })
    expect(a.words.at(-1)).toMatchObject({ index: 0, gone: true })
    const b = rig([FROM], { wordByWord: true }); await flush()
    b.cur().cb.onPartial('where'); b.cur().cb.onResult('', { words: [] })
    expect(b.words.some(w => w.gone)).toBe(false)
    a.l.stop(); b.l.stop()
  })
})

describe('журнал 10:49 (v3.3.318): дыхание засчитано, ложный откат, неверное слово молчит', () => {
  const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
  it('«первое слово засчиталось просто моим дыханием»: черновик «where», пустой итог после 2,6 с сплошного звука — слово откатывается и не подтверждается, красного нет', async () => {
    const r = rig([FROM], { wordByWord: true }); await flush()
    for (const v of [0.004, 0.166, 0.177, 0.19]) r.cur().cb.onLevel(v)
    r.cur().cb.onPartial('where'); r.advance(3500); r.cur().cb.onResult('', { words: [], voiceMs: 2603 }); r.advance(10); await flush()
    expect(r.words.at(-1)).toMatchObject({ index: 0, gone: true }); expect(r.words.some(w => !w.draft && !w.gone)).toBe(false)
    expect(r.hears.some(h => h.kind === 'wrong')).toBe(false)
    const q = rig([FROM], { wordByWord: true }); await flush() // короткое слово, которое итог не подтвердил (v3.3.283), — остаётся
    q.cur().cb.onPartial('where'); q.cur().cb.onResult('', { words: [], voiceMs: 400 }); expect(q.words.some(w => w.gone)).toBe(false)
    r.l.stop(); q.l.stop()
  })
  it('«увидел откат»: черновик «are where» (повтор последним словом — догадка Vosk) слово «are» не снимает; итог «are where» — снимает', () => {
    expect(strictHits(FROM.words, 'are where', 1, true).map(Number).join('')).toBe('1100')
    expect(strictHits(FROM.words, 'are where', 1).map(Number).join('')).toBe('1000')
    expect(strictHits(FROM.words, 'are where where', 1, true).map(Number).join('')).toBe('1000')
  })
  it('«громко говорю неправильное слово — красным не светится»: черновик из одного «[unk]» при голосе — через UNK_FINAL_MS просим итог; итог «[unk]» — неверное слово', async () => {
    const r = rig([FROM], { wordByWord: true }); await flush()
    for (const v of [0.002, 0.15, 0.17, 0.16]) r.cur().cb.onLevel(v)
    r.cur().cb.onPartial('[unk]'); r.advance(UNK_FINAL_MS - 10); expect(r.cur().stopped).toBe(0)
    r.advance(10); expect(r.cur().stopped).toBe(1)
    r.cur().cb.onResult('[unk]', { words: [] }); expect(r.hears.some(h => h.kind === 'wrong')).toBe(true)
    const q = rig([FROM], { wordByWord: true }); await flush() // «[unk]» из шума — итог не просим
    for (const v of [0.004, 0.005, 0.004, 0.005]) q.cur().cb.onLevel(v)
    q.cur().cb.onPartial('[unk]'); q.advance(UNK_FINAL_MS + 100); expect(q.cur().stopped).toBe(0)
    r.l.stop(); q.l.stop()
  })
})

describe('журнал 11:37 (v3.3.319): «стало очень хуже» — последнее слово «from» пять раз подряд не засчитано', () => {
  it('итог «[unk] [unk] from you» подтверждает «you»; потом «from» (итогом) закрывает фразу с первого раза — старое «from» из того захода в услышанном не остаётся', async () => {
    const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
    const r = rig([FROM], { wordByWord: true }); await flush()
    r.cur().cb.onPartial('where are'); await end(r, 'where are', 10)
    r.cur().cb.onPartial('[unk] [unk] from you'); await end(r, '[unk] [unk] from you', 10)
    expect(r.words.some(w => w.index === 2 && !w.draft && !w.gone)).toBe(true); expect(r.got).toEqual([])
    r.advance(1000); r.cur().cb.onPartial('from'); r.advance(400); r.cur().cb.onResult('from', { words: [] })
    expect(r.got.map(g => g.ratio)).toEqual([1])
    r.l.stop()
  })
})

describe('журнал 12:41 (v3.3.320): «первое слово срабатывает, даже звука почти не было» — щелчок 0,13 с дал черновик «where», через 2,9 с Vosk исправил на «[unk]», а слово уже подтвердилось', () => {
  const FROM = { key: 'from', words: ['Where', 'are', 'you', 'from'] }
  const speak = r => { for (const v of [0.0015, 0.0265, 0.0084, 0.0016]) r.cur().cb.onLevel(v) }
  it('первое слово черновиком не принимается: после паузы голоса просим итог; итог «[unk]» — слова нет', async () => {
    const r = rig([FROM], { wordByWord: true, holdFirst: true }); await flush()
    speak(r); r.cur().cb.onPartial('where'); expect(r.words).toEqual([])
    r.advance(400); expect(r.cur().stopped).toBe(1); expect(r.words).toEqual([])
    r.cur().cb.onResult('[unk]', { words: [] }); expect(r.words.filter(w => !w.gone)).toEqual([])
    r.l.stop()
  })
  it('итог «where» — слово засчитано; слитная речь «where are» — первое слово принято вторым без итога и без разрыва захода', async () => {
    const r = rig([FROM], { wordByWord: true, holdFirst: true }); await flush()
    speak(r); r.cur().cb.onPartial('where'); r.advance(400); r.cur().cb.onResult('where', { words: [] })
    expect(r.words.map(w => [w.index, !!w.draft])).toEqual([[0, false]])
    const q = rig([FROM], { wordByWord: true, holdFirst: true }); await flush()
    speak(q); q.cur().cb.onPartial('where'); q.advance(100); q.cur().cb.onPartial('where are')
    expect(q.words.map(w => w.index)).toEqual([0, 1]); expect(q.cur().stopped).toBe(0)
    q.l.stop(); r.l.stop()
  })
  it('пока голос идёт, итог не просим (слитную речь не рвём); порядок 3.3.320: слово держалось 1 с, потом заход стал «[unk]» — не подтверждается, а откатывается', async () => {
    const r = rig([FROM], { wordByWord: true, holdFirst: true }); await flush()
    speak(r); r.cur().cb.onPartial('where'); r.advance(250); r.cur().cb.onLevel(0.15); r.advance(100); expect(r.cur().stopped).toBe(0)
    const q = rig([FROM], { wordByWord: true }); await flush() // без правила первого слова — тот самый журнал
    speak(q); q.cur().cb.onPartial('where'); q.advance(2900); q.cur().cb.onPartial('[unk]')
    expect(q.words.at(-1)).toMatchObject({ index: 0, gone: true }); expect(q.words.some(w => !w.draft && !w.gone)).toBe(false)
    r.l.stop(); q.l.stop()
  })
})
