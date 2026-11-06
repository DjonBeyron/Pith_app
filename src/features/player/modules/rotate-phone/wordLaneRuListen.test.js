import { describe, it, expect } from 'vitest'
import { createWordListener, RU_SETTLE_MS, RU_FULL_TOKENS } from './wordLaneListen.js'

// Слушатель русской модели (проход B «Встряхни память»): попадание из черновика ждёт выдержку RU_SETTLE_MS — маленькая русская модель на ходу меняет одну цель на другую
// («я» → «где»: прогон vosk-model-small-ru-0.22), а засчитанное слово назад не откатывается: раньше пилюля «где» получала ошибку за «я», а потом «где» уже не засчитывалось.
// Сеанс Vosk ведёт тест: partial / result подаются руками, таймеры — ручные (now / setTimer).
function rig({ lang = 'ru', targets = ['встретить', 'где', 'я'], noVosk = false } = {}) {
  let t = 0
  const timers = new Map(); let id = 0
  const sessions = []
  const seen = []
  const listen = async (model, grammar, cb) => { const s = { cb, stopped: 0 }; sessions.push(s); cb.onReady?.(); return { stop() { s.stopped++ }, cancel() {} } }
  const l = createWordListener({
    targets, lang, noVosk, listen, runtime: { getModel: () => 'M', snapshot: () => ({}) }, onChange: s => seen.push(s), now: () => t,
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id }, clearTimer: k => timers.delete(k),
  })
  const advance = ms => { t += ms; for (const [k, x] of [...timers]) if (x.at <= t) { timers.delete(k); x.fn() } }
  const last = () => seen.at(-1)
  return { l, sessions, seen, advance, last, cur: () => sessions.at(-1) }
}
const flush = () => new Promise(r => setTimeout(r, 0))

describe('русская модель: попадание из черновика с выдержкой', () => {
  it('черновик «я» сменился на «где» раньше выдержки — засчитано только «где»', async () => {
    const r = rig(); r.l.start(); await flush()
    r.cur().cb.onPartial('я')
    expect(r.last().seq).toEqual([]) // ещё не засчитано
    expect(r.last().tail).toEqual({ target: 2, tokens: RU_FULL_TOKENS }) // пилюля цели наливается
    r.advance(200); r.cur().cb.onPartial('где')
    r.advance(RU_SETTLE_MS - 1); expect(r.last().seq).toEqual([])
    r.advance(1); expect(r.last().seq).toEqual([1])
    expect(r.seen.some(s => s.seq.includes(2))).toBe(false)
    r.l.dispose()
  })
  it('засчитанное слово закрывает заход: следующее слово слушает свежий распознаватель (словарь — 2 слова за заход)', async () => {
    const r = rig(); r.l.start(); await flush()
    r.cur().cb.onPartial('встретить'); r.advance(RU_SETTLE_MS)
    expect(r.last().seq).toEqual([0]); expect(r.cur().stopped).toBe(1)
    r.cur().cb.onResult('встретить', { words: [] }) // итог после стопа
    r.advance(200); await flush()
    expect(r.sessions).toHaveLength(2)
    r.cur().cb.onPartial('где'); r.advance(RU_SETTLE_MS)
    expect(r.last().seq).toEqual([0, 1])
    r.l.dispose()
  })
  it('итог выронил слово черновика (пусто) — засчитывается черновое; итог с другим словом — итоговое', async () => {
    const r = rig(); r.l.start(); await flush()
    r.cur().cb.onPartial('где'); r.advance(100)
    r.cur().cb.onResult('', { words: [] })
    expect(r.last().seq).toEqual([1])
    r.advance(200); await flush()
    r.cur().cb.onPartial('я'); r.advance(100)
    r.cur().cb.onResult('встретить', { words: [] })
    expect(r.last().seq).toEqual([1, 0])
    r.l.dispose()
  })
  it('черновик опустел («приятно» → «»: модель колеблется, прогон на настоящей модели) — слово было, засчитывается после выдержки', async () => {
    const r = rig(); r.l.start(); await flush()
    r.cur().cb.onPartial('я'); r.advance(100); r.cur().cb.onPartial('[unk]')
    expect(r.last().seq).toEqual([]); expect(r.last().tail).toEqual({ target: 2, tokens: RU_FULL_TOKENS })
    r.advance(RU_SETTLE_MS); expect(r.last().seq).toEqual([2])
    r.l.dispose()
  })
  it('английский слушатель не меняется: попадание из черновика засчитывается сразу, заход не закрывается', async () => {
    const r = rig({ lang: 'en', targets: ['meet', 'where'] }); r.l.start(); await flush()
    r.cur().cb.onPartial('meet'); expect(r.last().seq).toEqual([0]); expect(r.cur().stopped).toBe(0)
    r.l.dispose()
  })
})

describe('журнал слова и тап по ходу', () => {
  it('said(): последний черновик и итог с прошлого resetSaid()', async () => {
    const r = rig(); r.l.start(); await flush()
    expect(r.l.said()).toEqual({ partial: '', final: '' })
    r.cur().cb.onPartial('я'); r.cur().cb.onPartial('где'); r.cur().cb.onResult('где', { words: [] })
    expect(r.l.said()).toEqual({ partial: 'где', final: 'где' })
    r.l.resetSaid(); expect(r.l.said()).toEqual({ partial: '', final: '' })
    r.l.dispose()
  })
  it('noVosk — функция: проход перевели на тап, пока ждали модель — слушатель не сообщает «нет модели»', () => {
    let tap = false, t = 0
    const seen = [], timers = []
    const l = createWordListener({ targets: ['где'], lang: 'ru', noVosk: () => tap, runtime: { getModel: () => null, snapshot: () => ({ expecting: true }) }, onChange: s => seen.push(s.status), now: () => t, setTimer: fn => { timers.push(fn); return timers.length }, clearTimer: () => {} })
    l.start(); expect(seen).toEqual(['starting'])
    tap = true; t += 1000; timers.shift()()
    expect(seen.at(-1)).toBe('listening'); expect(l.available()).toBe(true)
    l.dispose()
  })
})
