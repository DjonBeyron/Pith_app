import { describe, it, expect } from 'vitest'
import { needMs, createWordEar, QUIET_MS, QUIET_PHRASE_MS, CONF_MIN, CONF_MIN_RU, PER_SYL_MS, WAIT_MAX_MS } from './wordEarRule.js'
import { createWordListener } from './wordLaneListen.js'

// Честный зачёт слова (v3.3.183, отчёты владельца с iPhone: «interesting» — 18 попыток, 0 зачётов: тихую часть слова правило считало тишиной и обрывало заход; «milk» засчитан на «mil…»,
// «window» — на «win…»). Правило: зачёт слова — только по итогу после конца голоса; порог голоса — от шума микрофона и пика речи. Сеанс Vosk ведёт тест, часы и уровень — ручные.
const CHUNK = 46
const NOISE = 0.0002 // фон микрофона iPhone
function rig({ targets = ['wonderful'], lang = 'en', earRule = true, expected = 1, noise = NOISE, stream = false } = {}) {
  let t = 0
  const timers = new Map(); let id = 0
  const sessions = [], seen = [], logs = []
  const listen = async (model, grammar, cb) => { const s = { cb, stops: [], grammar: JSON.parse(grammar) }; sessions.push(s); cb.onReady?.(); return { stop(why) { s.stops.push(why ?? null) }, cancel() {} } }
  const l = createWordListener({
    targets, expected, maxWords: 2, lang, earRule, listen, ...(stream ? { getStream: () => ({}) } : {}), runtime: { getModel: () => 'M', snapshot: () => ({}) }, onChange: s => seen.push(s), onDebug: (k, d) => { if (k === 'ear') logs.push(d.text) }, now: () => t,
    setTimer: (fn, ms) => { timers.set(++id, { fn, at: t + ms }); return id }, clearTimer: k => timers.delete(k),
  })
  const advance = ms => { t += ms; for (const [k, x] of [...timers]) if (x.at <= t) { timers.delete(k); x.fn() } }
  const cur = () => sessions.at(-1)
  const voice = (ms, rms = 0.2) => { for (let k = 0; k < ms; k += CHUNK) { cur().cb.onLevel(rms); advance(CHUNK) } }
  const still = (ms = QUIET_MS + CHUNK) => voice(ms, noise)
  const open = async () => { l.start(); await new Promise(r => setTimeout(r, 0)); still(300) } // заход открыт, правило услышало фон
  return { l, sessions, seen, logs, advance, voice, still, open, cur, hits: () => seen.at(-1)?.seq.length ?? 0 }
}
const W = (word, conf = 1, start = 0.3, end = 0.9) => ({ word, conf, start, end })

describe('слушатель слов с правилом (earRule): целое слово', () => {
  it('тихий микрофон iPhone (речь 0,012–0,026, фон 0,0002): «interesting» со смычкой внутри — заход не обрывается посреди слова, итог просим после конца, зачёт', async () => {
    const r = rig({ targets: ['interesting'] }); await r.open()
    r.voice(140, 0.024); r.voice(140, 0.013) // «inter-»: кусок 0,013 раньше считался тишиной (порог 0,015)
    r.voice(140, 0.0004)                     // смычка «t» — почти тишина, короче QUIET_MS
    expect(r.cur().stops).toEqual([])
    r.voice(92, 0.002); r.voice(140, 0.018)  // «-sting»: тихое «s» (8 % пика) — голос
    expect(r.cur().stops).toEqual([])
    expect(r.logs.some(s => /^пауза внутри речи \d+ мс \(самый тихий кусок 0\.0004, короче 220 мс\) — жду дальше$/.test(s))).toBe(true)
    r.cur().cb.onPartial('interesting'); expect(r.hits()).toBe(0) // черновик не засчитывается
    r.still()
    expect(r.cur().stops).toEqual(['ear'])
    expect(r.logs.at(-1)).toMatch(/^голос кончился: шёл \d+ мс, тишина \d+ мс ≥ 220 \(порог голоса 0\.00\d+ \(шум 0\.0002, пик речи 0\.024\), тихие куски от 0\.0002\) — прошу итог$/)
    r.cur().cb.onResult('interesting', { words: [W('interesting', 1, 0.36, 1.1)] })
    expect(r.hits()).toBe(1)
    expect(r.logs.at(-1)).toMatch(/^итог «interesting»: interesting conf 1, по Vosk 740 мс, голос \d+ мс \(ожидаю ≥ 480\) — зачёт$/)
    r.l.dispose()
  })
  it('громкий микрофон с шумом (речь 0,2, фон 0,004): тот же порядок — порог подстроился', async () => {
    const r = rig({ targets: ['window'], noise: 0.004 }); await r.open()
    r.voice(300, 0.2); r.voice(92, 0.02); r.voice(140, 0.15)
    expect(r.cur().stops).toEqual([])
    r.still(); expect(r.cur().stops).toEqual(['ear'])
    r.cur().cb.onResult('window', { words: [W('window')] })
    expect(r.hits()).toBe(1)
    r.l.dispose()
  })
  it('итог просим по концу голоса и без черновика; conf цели ниже порога или голос короче слоги × 120 мс — не засчитано', async () => {
    const r = rig(); await r.open()
    r.voice(700); r.still(); expect(r.cur().stops).toEqual(['ear'])
    expect(r.logs.at(-1)).toMatch(/— прошу итог, не дожидаясь черновика$/)
    r.cur().cb.onResult('wonderful', { words: [W('wonderful', CONF_MIN - 0.1)] })
    expect(r.hits()).toBe(0); expect(r.logs.at(-1)).toMatch(/conf < 0\.35 — не засчитано: Vosk не уверен, что слово сказано целиком$/)
    const u = rig({ targets: ['together'] }); await u.open() // «toge» + тишина: Vosk отдал together с conf 1, но голоса 280 мс < 3 слога × 120
    u.voice(280); u.cur().cb.onPartial('together'); u.still()
    u.cur().cb.onResult('together', { words: [W('together')] })
    expect(u.hits()).toBe(0); expect(u.logs.at(-1)).toMatch(/голос короче — не засчитано: голос короче слова \(черновик был «together»\)$/)
    expect(needMs('together')).toBe(3 * PER_SYL_MS)
    r.l.dispose(); u.l.dispose()
  })
})

describe('слушатель слов с правилом (earRule): недоговорённое слово', () => {
  it('короткое слово: «mil…» — черновик «milk» на 170 мс голоса не засчитан; итог — ловушка «mill»: счёт 0, промахов 0', async () => {
    const r = rig({ targets: ['milk'] }); await r.open()
    expect(r.cur().grammar).toEqual(expect.arrayContaining(['milk', 'mil', 'mill', 'mile']))
    r.voice(170, 0.02); r.cur().cb.onPartial('milk')
    expect(r.hits()).toBe(0)
    expect(r.logs.at(-1)).toMatch(/^черновик «milk»: «milk» — последнее слово, может быть не договорено \(голос \d+ мс, слогов 1\) — жду конец голоса и итог$/)
    expect(r.seen.at(-1).tail).toMatchObject({ target: 0 }) // пилюля цели наливается, пока ждём
    r.voice(140, 0.02); expect(r.hits()).toBe(0)           // голос дорос — всё равно ждём итог
    r.still(); expect(r.cur().stops).toEqual(['ear'])
    r.cur().cb.onResult('mill', { words: [W('mill', 0.5)] })
    expect(r.seen.at(-1)).toMatchObject({ seq: [], misses: 0 })
    expect(r.logs.at(-1)).toBe('итог «mill»: mill — ловушка (обрубок цели) conf 0.5 — не засчитано: слово не договорено (черновик был «milk»)')
    r.l.dispose()
  })
  it('два слога: «win…» — черновик «window» при голосе 300 мс не засчитан (раньше хватало 240 мс); итог «win» — нет, итог «window» — да', async () => {
    const a = rig({ targets: ['window'] }); await a.open()
    a.voice(300); a.cur().cb.onPartial('window'); a.voice(92); expect(a.hits()).toBe(0)
    a.still(); a.cur().cb.onResult('win', { words: [W('win')] }); expect(a.hits()).toBe(0)
    const b = rig({ targets: ['window'] }); await b.open()
    b.voice(500); b.cur().cb.onPartial('window'); b.still(); b.cur().cb.onResult('window', { words: [W('window')] }); expect(b.hits()).toBe(1)
    a.l.dispose(); b.l.dispose()
  })
  it('слово без слов-соседей (cat): итогу не с чем сверить — зачёт по черновику, но не раньше конца голоса; у слова с соседями (milk) черновик не спасает', async () => {
    const a = rig({ targets: ['cat'] }); await a.open()
    expect(a.cur().grammar.some(g => /^ca/.test(g) && g !== 'cat' && !g.includes(' '))).toBe(false)
    a.voice(300); a.cur().cb.onPartial('cat'); expect(a.hits()).toBe(0)
    a.cur().cb.onPartial('[unk]')
    a.still(); a.cur().cb.onResult('', { words: [W('[unk]')] })
    expect(a.hits()).toBe(1)
    expect(a.logs.at(-1)).toMatch(/^итог «\[unk\]»: слова в итоге нет, но в черновике было «cat», а слов-соседей у него нет — сверить не с чем; голос \d+ мс \(ожидаю ≥ 120\) — зачёт$/)
    const b = rig({ targets: ['cat'] }); await b.open() // без черновика с целью — нет
    b.voice(300); b.still(); b.cur().cb.onResult('', { words: [W('[unk]')] })
    expect(b.hits()).toBe(0)
    const c = rig({ targets: ['milk'] }); await c.open()
    c.voice(300, 0.02); c.cur().cb.onPartial('milk'); c.still(); c.cur().cb.onResult('', { words: [W('[unk]')] })
    expect(c.hits()).toBe(0)
    a.l.dispose(); b.l.dispose(); c.l.dispose()
  })
  it('речь тише порога начала (правило голоса не слышит, а Vosk слышит): итог не просим сразу — ждём, пока черновик не меняется QUIET_MS; длину голоса не сверяем', async () => {
    const r = rig({ targets: ['milk'] }); await r.open()
    r.voice(300, 0.002); r.cur().cb.onPartial('mil'); r.cur().cb.onPartial('milk')
    r.voice(140, 0.002); expect(r.cur().stops).toEqual([]) // раньше: «тишина» считалась от давнего голоса — заход обрывался сразу
    r.voice(140, 0.002)
    expect(r.cur().stops).toEqual(['ear'])
    expect(r.logs.at(-1)).toMatch(/^голос тише порога начала 0\.003 \(шум 0\.000\d\) — правило его не слышит; черновик не меняется \d+ мс ≥ 220 — прошу итог$/)
    r.cur().cb.onResult('milk', { words: [W('milk')] })
    expect(r.hits()).toBe(1)
    expect(r.logs.at(-1)).toMatch(/^итог «milk»: milk conf 1, по Vosk 600 мс, голос тише порога — длину не сверяю — зачёт$/)
    r.l.dispose()
  })
  it('после итога по просьбе правила следующий заход начинается сразу (поток игры открыт) — начало следующего слова не теряется', async () => {
    const r = rig({ targets: ['milk'], stream: true }); await r.open()
    r.voice(300, 0.02); r.still(); r.cur().cb.onResult('mill', { words: [W('mill', 0.5)] })
    expect(r.sessions.length).toBe(1)
    r.advance(0); await new Promise(res => setTimeout(res, 0))
    expect(r.sessions.length).toBe(2)
    r.l.dispose()
  })
  it('шум не даёт тишины — итог просим через WAIT_MAX_MS после черновика', async () => {
    const r = rig({ targets: ['cat'] }); await r.open()
    r.voice(200); r.cur().cb.onPartial('cat'); r.voice(WAIT_MAX_MS + CHUNK)
    expect(r.cur().stops).toEqual(['ear'])
    expect(r.logs.at(-1)).toMatch(/^тишины нет 2500 мс \(порог голоса .*\) — прошу итог$/)
    r.l.dispose()
  })
  it('русская модель: порог conf прежний (0,7), ловушки — начала длинных слов', async () => {
    const r = rig({ targets: ['чудесный'], lang: 'ru' }); await r.open()
    expect(r.cur().grammar).toContain('чудес')
    r.voice(600); r.still(); r.cur().cb.onResult('чудесный', { words: [W('чудесный', CONF_MIN_RU - 0.1)] })
    expect(r.hits()).toBe(0)
    r.l.dispose()
  })
})

describe('слушатель слов с правилом (earRule): серии, фразы, режим записи', () => {
  it('серия слов подряд: слово, после которого в черновике идёт следующее, засчитывается сразу; последнее ждёт итог', async () => {
    const r = rig({ targets: ['try'], expected: 3 }); await r.open()
    r.voice(300); r.cur().cb.onPartial('try'); expect(r.hits()).toBe(0)
    r.voice(300); r.cur().cb.onPartial('try try'); expect(r.hits()).toBe(1)
    r.voice(300); r.cur().cb.onPartial('try try [unk]'); expect(r.hits()).toBe(2)
    expect(r.logs.at(-1)).toBe('черновик «try try [unk]»: после «try» идёт другое слово, значит оно договорено — зачёт')
    r.l.dispose()
  })
  it('цели вперемешку (слова и фраза): фраза засчитывается черновиком, как раньше; слова фразы — не ловушки', async () => {
    const r = rig({ targets: ["i'm", 'trying', 'to learn'], expected: 3 }); await r.open()
    for (const w of ['to', 'learn', 'i', 'am', "i'm"]) expect(r.cur().grammar.filter(g => !g.includes('[unk]') && !/^(i'm|i am|trying|to learn)( |$)/.test(g)).flatMap(g => g.split(' '))).not.toContain(w)
    r.voice(250); r.cur().cb.onPartial("i'm"); expect(r.hits()).toBe(0)
    r.voice(250); r.cur().cb.onPartial("i'm trying"); expect(r.hits()).toBe(1)
    r.voice(350); r.cur().cb.onPartial("i'm trying to learn"); expect(r.hits()).toBe(3)
    r.l.dispose()
  })
  it('фраза из нескольких слов с паузой между словами (ступень вперемешку): пауза длиннее QUIET_MS заход не обрывает — фраза засчитывается целиком; итог без черновика просим после QUIET_PHRASE_MS', async () => {
    const r = rig({ targets: ['trying', 'to learn'], expected: 2 }); await r.open()
    r.voice(200); r.cur().cb.onPartial('to'); r.still(QUIET_MS + 3 * CHUNK)
    expect(r.cur().stops).toEqual([]) // «to … learn»: ждём продолжение фразы
    r.voice(300); r.cur().cb.onPartial('to learn'); expect(r.hits()).toBe(1)
    r.voice(300); r.cur().cb.onPartial('to learn trying'); expect(r.hits()).toBe(1) // цель-слово последним — ждёт итог
    r.still(); expect(r.cur().stops).toEqual(['ear'])                               // с черновиком цели-слова — обычные QUIET_MS
    r.cur().cb.onResult('to learn trying', { words: [W('to'), W('learn'), W('trying')] }); expect(r.hits()).toBe(2)
    const u = rig({ targets: ['trying', 'to learn'], expected: 2 }); await u.open()
    u.voice(300); u.still(QUIET_PHRASE_MS + CHUNK)
    expect(u.cur().stops).toEqual(['ear'])
    expect(u.logs.at(-1)).toMatch(/тишина \d+ мс ≥ 600 .* — прошу итог, не дожидаясь черновика$/)
    r.l.dispose(); u.l.dispose()
  })
  it('только фразы — правило не вмешивается: ни ловушек, ни просьбы итога, ни журнала', () => {
    const logs = []
    let t = 0
    const ear = createWordEar({ targets: ["i'm trying"], now: () => t, log: s => logs.push(s) })
    expect(ear.decoys).toEqual([])
    for (let k = 0; k < 30; k++) { expect(ear.level(k < 10 ? 0.2 : 0.0002)).toBe(null); t += CHUNK }
    expect(ear.draft([0], 0, "i'm trying")).toEqual([0])
    expect(ear.finalText("i'm trying", [W("i'm", 0.2), W('trying', 0.2)])).toBe("i'm trying")
    expect(logs).toEqual([])
  })
  it('без правила (earRule: false, режим записи) — как раньше: черновик засчитывается сразу, грамматика без ловушек, итог никто не просит', async () => {
    const r = rig({ earRule: false }); await r.open()
    expect(r.cur().grammar).not.toContain('wonder')
    r.voice(230); r.cur().cb.onPartial('wonderful'); expect(r.hits()).toBe(1)
    r.still(); expect(r.cur().stops).toEqual([])
    r.l.dispose()
  })
})
