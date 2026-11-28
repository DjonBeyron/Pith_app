import { describe, it, expect } from 'vitest'
import { rig, flush, end } from './racePhraseListenRig.js'
import { createSticky } from './racePhraseSticky.js'
import { JOIN_MS } from './racePhraseListen.js'

// Проход 2 «Скажи» (быстро): слово, которое Vosk услышал в заходе и потом потерял в тексте, остаётся сказанным и для зачёта (v3.3.342, решение владельца 2026-11-22).
// Журнал владельца 22.11 17:12, «I'm trying to learn»: черновики «i'm» → «trying» → «trying to» → «trying to learn», итог «trying to learn» — пилюля залита на 97 %, а фраза «неполная (75 %)».
const LEARN = { key: 'learn', words: ["I'm", 'trying', 'to', 'learn'] }

describe('проход 2: пилюля залита — фраза засчитана', () => {
  it('журнал владельца: «i\'m» было в черновике, Vosk переписал заход без него — фраза засчитана целиком, а не «неполная 75 %»', async () => {
    const r = rig([LEARN]); await flush()
    r.cur().cb.onPartial("i'm"); r.cur().cb.onPartial('trying'); r.cur().cb.onPartial('trying to')
    expect(r.got).toEqual([])
    r.cur().cb.onPartial('trying to learn')
    expect(r.got.map(g => [g.phraseKey, g.ratio])).toEqual([['learn', 1]])
    expect([...new Set(r.words.map(w => w.index))].sort()).toEqual([0, 1, 2, 3])
    expect(r.logs.some(l => l.includes('остаётся сказанным (проход 2)'))).toBe(true)
    r.l.stop()
  })
  it('слово, которого Vosk не слышал вовсе, не засчитывается: «trying to learn» без «i\'m» — 3 из 4, полной фразы нет', async () => {
    const r = rig([LEARN], { allowPartial: () => false }); await flush()
    r.cur().cb.onPartial('trying'); r.cur().cb.onPartial('trying to learn'); await end(r, 'trying to learn', 10)
    expect(r.got).toEqual([]); expect(r.words.some(w => w.index === 0)).toBe(false)
    r.l.stop()
  })
  it('слово закрытого захода живёт столько же, сколько его текст (JOIN_MS): позже — уже не считается; новый ход (reset) забывает всё', async () => {
    const r = rig([LEARN], { allowPartial: () => false }); await flush()
    r.cur().cb.onPartial("i'm"); r.cur().cb.onPartial('trying'); await end(r, 'trying', 10) // «i'm» потеряно, заход закрыт
    r.advance(JOIN_MS + 500); await flush()
    r.cur().cb.onPartial('to learn'); expect(r.got).toEqual([])
    const q = rig([LEARN]); await flush()
    q.cur().cb.onPartial("i'm"); q.cur().cb.onPartial('trying'); q.l.reset(); await flush()
    q.cur().cb.onPartial('trying to learn'); expect(q.got).toEqual([])
    r.l.stop(); q.l.stop()
  })
  it('проход 1 «по слову» правило не трогает: потерянное слово там не «липкое»', async () => {
    const r = rig([LEARN], { wordByWord: true }); await flush()
    r.cur().cb.onPartial("i'm"); r.cur().cb.onPartial('trying to learn'); await end(r, 'trying to learn', 10)
    expect(r.got).toEqual([])
    r.l.stop()
  })
})

describe('createSticky', () => {
  it('prefix — непрерывное «липкое» начало: слова после дыры не входят; закрытые заходы живут keepMs; clear забывает', () => {
    let t = 0
    const s = createSticky({ now: () => t, keepMs: 1000 })
    expect(s.prefix('k')).toBe(0)
    s.add('k', 0); s.add('k', 2); expect(s.prefix('k')).toBe(1) // слово 3 после дыры (2-е не сказано) не липнет
    s.add('k', 1); expect(s.prefix('k')).toBe(3)
    s.close(); t = 900; expect(s.prefix('k')).toBe(3)
    t = 1100; expect(s.prefix('k')).toBe(0)
    s.add('k', 0); s.clear(); expect(s.prefix('k')).toBe(0)
  })
})

// Решение владельца 2026-11-28: слова ПОСЛЕ неверного / пропущенного слова не хранятся, в том числе в проходе 2.
describe('проход 2: слова после пропуска не хранятся', () => {
  const FROM = { key: 'where are you from', words: ['where', 'are', 'you', 'from'] }
  it('«where you from» (пропущено «are») — только «where»; сказано «are» — засчитано только оно, «you from» нужно сказать заново', async () => {
    const r = rig([FROM], { allowPartial: () => true }); await flush()
    r.cur().cb.onPartial('where'); r.cur().cb.onPartial('where you'); r.cur().cb.onPartial('where you from')
    await end(r, 'where you from', 2000)
    expect(r.got).toEqual([]); expect([...new Set(r.words.map(w => w.index))]).toEqual([0])
    r.cur().cb.onPartial('are'); r.advance(2000); await flush()
    expect(r.got).toEqual([]); expect([...new Set(r.words.map(w => w.index))].sort()).toEqual([0, 1])
    r.cur().cb.onPartial('you from')
    expect(r.got.map(g => g.ratio)).toEqual([1]); r.l.stop()
  })
  it('сказано всё подряд после исправления в одном заходе: «where you from are you from» — полная фраза', async () => {
    const r = rig([FROM]); await flush()
    r.cur().cb.onPartial('where you from are you from'); expect(r.got.map(g => g.ratio)).toEqual([1]); r.l.stop()
  })
  it('пропущено последнее слово («where are you») — 75 % как раньше, засчитывается у края', async () => {
    const r = rig([FROM]); await flush()
    await end(r, 'where are you', 2000); expect(r.got.map(g => g.ratio)).toEqual([0.75]); r.l.stop()
  })
  it('пропущено первое слово: «are you from» — слов нет, «where» потом — только оно; «are you from» заново', async () => {
    const r = rig([FROM], { allowPartial: () => true }); await flush()
    await end(r, 'are you from', 2000); expect(r.got).toEqual([]); expect(r.words.length).toBe(0)
    r.l.stop()
  })
  it('неверное слово вместо верного посреди фразы: «where is you from» — только «where»', async () => {
    const r = rig([FROM]); await flush()
    await end(r, 'where is you from', 2000); expect(r.got).toEqual([]); expect([...new Set(r.words.map(w => w.index))]).toEqual([0]); r.l.stop()
  })
  it('несколько ошибок подряд: «where you from» → «are from» → «you from»: линия идёт только по порядку', async () => {
    const r = rig([FROM]); await flush()
    r.cur().cb.onPartial('where you from'); r.cur().cb.onPartial('where you from are'); r.cur().cb.onPartial('where you from are from')
    expect([...new Set(r.words.map(w => w.index))].sort()).toEqual([0, 1]); expect(r.got).toEqual([])
    r.cur().cb.onPartial('where you from are from you from'); expect(r.got.map(g => g.ratio)).toEqual([1]); r.l.stop()
  })
})

describe('проход 1 — то же правило (strictHits), поведение единое', () => {
  const FROM = { key: 'where are you from', words: ['where', 'are', 'you', 'from'] }
  const said = r => [...new Set(r.words.filter(w => !w.draft && !w.gone).map(w => w.index))].sort()
  it('«where you from» итогом — подтверждено только «where»; потом «are» — только оно; «you from» заново — полная фраза', async () => {
    const r = rig([FROM], { wordByWord: true }); await flush()
    await end(r, 'where you from', 3000); expect(said(r)).toEqual([0]); expect(r.got).toEqual([])
    await end(r, 'are', 3000); expect(said(r)).toEqual([0, 1]); expect(r.got).toEqual([])
    await end(r, 'you from', 3000); expect(r.got.map(g => g.ratio)).toEqual([1]); r.l.stop()
  })
})
