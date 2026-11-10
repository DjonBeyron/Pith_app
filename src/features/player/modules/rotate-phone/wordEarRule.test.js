import { describe, it, expect } from 'vitest'
import { syllables, needMs, earDecoys, earGrammar, createWordEar, QUIET_MS, CONF_MIN, PER_SYL_MS, EAR_VOICE_RMS } from './wordEarRule.js'
import { createWordListener } from './wordLaneListen.js'
import { targetGrammar } from './wordLaneMatch.js'

// Честный зачёт слова (замечание владельца «начал говорить начало слова — уже засчитал», цель wonderful). Замер реальным Vosk EN: черновик «wonderful» приходит через ≈ 270 мс голоса и при 40 % слова;
// правило: ловушки-начала в грамматике, черновик длинного слова — только с подтверждением итогом (conf), итог просим по концу голоса. Сеанс Vosk ведёт тест, часы и уровень — ручные.
const CHUNK = 46
function rig({ targets = ['wonderful'], lang = 'en', earRule = true } = {}) {
  let t = 0
  const timers = new Map(); let id = 0
  const sessions = [], seen = [], logs = []
  const listen = async (model, grammar, cb) => { const s = { cb, stops: [], grammar: JSON.parse(grammar) }; sessions.push(s); cb.onReady?.(); return { stop(why) { s.stops.push(why ?? null) }, cancel() {} } }
  const l = createWordListener({
    targets, expected: 1, maxWords: 2, lang, earRule, listen, runtime: { getModel: () => 'M', snapshot: () => ({}) }, onChange: s => seen.push(s), onDebug: (k, d) => { if (k === 'ear') logs.push(d.text) }, now: () => t,
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id }, clearTimer: k => timers.delete(k),
  })
  const advance = ms => { t += ms; for (const [k, x] of [...timers]) if (x.at <= t) { timers.delete(k); x.fn() } }
  const cur = () => sessions.at(-1)
  const voice = (ms, rms = 0.2) => { for (let k = 0; k < ms; k += CHUNK) { cur().cb.onLevel(rms); advance(CHUNK) } }
  return { l, sessions, seen, logs, advance, voice, cur, hits: () => seen.at(-1)?.seq.length ?? 0 }
}
const flush = () => new Promise(r => setTimeout(r, 0))

describe('слоги, ожидаемая длина, ловушки', () => {
  it('слоги по группам гласных (немое e не считается), русские — по гласным', () => {
    expect(['cat', 'hello', 'water', 'love', 'table', 'wonderful', 'beautiful', 'interesting', 'yesterday'].map(w => syllables(w))).toEqual([1, 2, 2, 1, 2, 3, 3, 4, 3])
    expect(['кот', 'привет', 'чудесный', 'интересный'].map(w => syllables(w, 'ru'))).toEqual([1, 2, 3, 4])
    expect(needMs('wonderful')).toBe(3 * PER_SYL_MS)
  })
  it('ловушки — начала одиночных слов ≥ 6 букв и 2 слогов (+y / +e у английских: «beaut» → «beauty»), не сами цели; фразы и короткие слова — без ловушек', () => {
    const d = earDecoys(['wonderful'])
    for (const w of ['won', 'wonder', 'wonderf']) expect(d).toContain(w)
    expect(earDecoys(['beautiful'])).toContain('beauty')
    expect(earDecoys(['wonderful'])).not.toContain('wonderful')
    expect(earDecoys(['cat', "i'm trying", 'hello'])).toEqual([])
    expect(earDecoys(['чудесный'], 'ru')).toContain('чудес')
  })
  it('грамматика: ловушки — отдельными вариантами, варианты цели как были', () => {
    const base = targetGrammar(['wonderful'], 2)
    const g = JSON.parse(earGrammar(base, ['won', 'wonder']))
    expect(g.slice(0, JSON.parse(base).length)).toEqual(JSON.parse(base))
    expect(g.slice(-2)).toEqual(['won', 'wonder'])
    expect(earGrammar(base, [])).toBe(base)
  })
})

describe('слушатель слов с правилом (earRule)', () => {
  it('обрубок: черновик «wonderful» на 230 мс голоса — не засчитан; голос кончился — итог просим сразу (stop «ear»); итог «» — не засчитано', async () => {
    const r = rig(); r.l.start(); await flush()
    expect(r.cur().grammar).toContain('wonder') // ловушка в грамматике
    r.voice(230); r.cur().cb.onPartial('wonderful')
    expect(r.hits()).toBe(0)
    expect(r.logs.at(-1)).toMatch(/^черновик «wonderful» на \d+ мс голоса \(3 слога, ожидаю ≥ 360\) — жду итог$/)
    r.voice(QUIET_MS + CHUNK, 0.001)
    expect(r.cur().stops).toEqual(['ear'])
    r.cur().cb.onResult('', { words: [] })
    expect(r.hits()).toBe(0)
    expect(r.logs.at(-1)).toMatch(/не засчитано \(черновик был «wonderful»\)/)
    r.l.dispose()
  })
  it('целое слово: итог с conf ≥ CONF_MIN — зачёт; conf ниже — нет', async () => {
    const r = rig(); r.l.start(); await flush()
    r.voice(700); r.cur().cb.onPartial('wonderful'); r.voice(QUIET_MS + CHUNK, 0.001)
    r.cur().cb.onResult('wonderful', { words: [{ word: 'wonderful', conf: 1, start: 0.36, end: 1.1 }] })
    expect(r.hits()).toBe(1)
    expect(r.logs.at(-1)).toMatch(/^итог «wonderful»: wonderful conf 1, по Vosk 740 мс, голос \d+ мс \(ожидаю ≥ 360\) — зачёт$/)
    const s = rig(); s.l.start(); await flush()
    s.voice(400); s.cur().cb.onPartial('wonderful'); s.voice(QUIET_MS + CHUNK, 0.001)
    s.cur().cb.onResult('wonderful', { words: [{ word: 'wonderful', conf: CONF_MIN - 0.13, start: 0.33, end: 0.84 }] })
    expect(s.hits()).toBe(0)
    const u = rig({ targets: ['together'] }); u.l.start(); await flush() // «toge» + тишина: Vosk отдал together с conf 1, но голоса 280 мс < 3 слога × 120
    u.voice(280); u.cur().cb.onPartial('together'); u.voice(QUIET_MS + CHUNK, 0.001)
    u.cur().cb.onResult('together', { words: [{ word: 'together', conf: 1, start: 0.33, end: 0.75 }] })
    expect(u.hits()).toBe(0); expect(u.logs.at(-1)).toMatch(/голос короче — не засчитано/)
    r.l.dispose(); s.l.dispose(); u.l.dispose()
  })
  it('ловушка — ни зачёт, ни промах: черновик «wonder», итог «wonder» — счёт 0, промахов 0', async () => {
    const r = rig(); r.l.start(); await flush()
    r.voice(400); r.cur().cb.onPartial('wonder'); r.voice(QUIET_MS + CHUNK, 0.001)
    expect(r.cur().stops).toEqual(['ear']) // итог по концу голоса и без черновика с целью
    r.cur().cb.onResult('wonder', { words: [{ word: 'wonder', conf: 1, start: 0.36, end: 0.84 }] })
    expect(r.seen.at(-1)).toMatchObject({ seq: [], misses: 0 })
    r.l.dispose()
  })
  it('слово в 1 слог — черновиком сразу; в 2 — когда голос дорос до слоги × 120 мс', async () => {
    const a = rig({ targets: ['cat'] }); a.l.start(); await flush()
    a.voice(100); a.cur().cb.onPartial('cat'); expect(a.hits()).toBe(1)
    const b = rig({ targets: ['hello'] }); b.l.start(); await flush()
    b.voice(130); b.cur().cb.onPartial('hello'); expect(b.hits()).toBe(0)
    b.voice(140); expect(b.hits()).toBe(1)
    expect(b.logs.at(-1)).toMatch(/голос дорос до \d+ мс \(ожидаю ≥ 240\) — зачёт/)
    a.l.dispose(); b.l.dispose()
  })
  it('без правила (earRule: false) — как раньше: черновик засчитывается сразу, грамматика без ловушек', async () => {
    const r = rig({ earRule: false }); r.l.start(); await flush()
    expect(r.cur().grammar).not.toContain('wonder')
    r.voice(230); r.cur().cb.onPartial('wonderful'); expect(r.hits()).toBe(1)
    r.l.dispose()
  })
  it('фраза из нескольких слов правилом не задерживается', () => {
    const logs = []
    let t = 0
    const ear = createWordEar({ targets: ["i'm trying"], now: () => t, log: s => logs.push(s) })
    ear.level(EAR_VOICE_RMS * 2); t += 100
    expect(ear.draft([0], "i'm trying", "i'm trying")).toBe(true)
    expect(logs).toEqual([])
  })
})
