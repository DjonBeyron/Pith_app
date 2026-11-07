import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { demoPhrase, demoPlan, runDemoScript, createDemoGate, demoSeen, demoAllowed, markDemoShown, heardUpTo, DEMO_KEY, DEMO_MAX_SHOWS, LINE_SILENT_MS, DEMO_LINE_GAP_MS, DEMO_WORD_GAP_MS, DEMO_RUN_GAP_MS, DEMO_WORD_MS } from './racePhraseDemo.js'
import { createKit } from './raceStageKit.js'
import { phraseStages } from './raceStagesPhrases.js'
import { PHRASE_FIXTURE } from './racePhraseFixture.js'
import { round2SayTurns } from './racePhraseTurns.js'

// Демо «Скажи»: какая фраза, скрипт, ворота игры. Демо-ход на живой пилюле в сцене — racePhraseDemoTurn.test.js
const P = (text, own = true) => ({ text, key: text.toLowerCase(), own })
const memStore = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) } }

describe('демо «Скажи»: какая фраза', () => {
  it('запасная фраза (own: false), не цель круга; из нескольких — самая короткая', () => {
    const list = [P('Nice to meet you'), P('Where are you from'), P('I will see you tomorrow morning', false), P('See you later', false)]
    expect(demoPhrase(list, round2SayTurns(list))).toEqual({ text: 'See you later', key: 'see you later', spare: true })
  })
  it('запасная, которая всё же цель круга, не берётся; запасной нет — первая фраза круга', () => {
    const list = [P('Nice to meet you'), P('Where are you from')]
    expect(demoPhrase(list, round2SayTurns(list))).toEqual({ text: 'Nice to meet you', key: 'nice to meet you', spare: false })
    const odd = [P('Nice to meet you'), { ...P('See you later', false) }]
    expect(demoPhrase(odd, [...round2SayTurns(odd), { target: odd[1] }]).text).toBe('Nice to meet you')
  })
  it('запасная без озвучки хоть одного слова (voiced) не берётся — первая фраза круга; озвученная запасная — берётся', () => {
    const list = [P('Nice to meet you'), P('Where are you from'), P('See you later', false), P('Good night', false)]
    const lib = new Set(['nice', 'to', 'meet', 'you', 'see', 'where', 'are', 'from'])
    const voiced = t => t.split(' ').every(w => lib.has(w.toLowerCase()))
    expect(demoPhrase(list, round2SayTurns(list), voiced)).toEqual({ text: 'Nice to meet you', key: 'nice to meet you', spare: false })
    lib.add('later')
    expect(demoPhrase(list, round2SayTurns(list), voiced).text).toBe('See you later')
  })
  it('запасная длиннее четырёх слов — первая фраза круга, если она короче; пусто — null', () => {
    const list = [P('Nice to meet you'), P('I will see you tomorrow morning', false)]
    expect(demoPhrase(list, round2SayTurns(list)).text).toBe('Nice to meet you')
    expect(demoPhrase([], [])).toBeNull()
  })
  it('фикстура: дежурная «See you later»; голосом — в ступени круга 2 (step.phrases.demo), плашка без demo; «Пальцами» демо нет', () => {
    expect(demoPhrase(PHRASE_FIXTURE, round2SayTurns(PHRASE_FIXTURE)).text).toBe('See you later')
    const plan = { seed: 7, chunks: ['a'], words: [], phrases: PHRASE_FIXTURE }
    const act = { id: 'phrases', title: 'Фразы', task: '', line: 'race_phrases', phrases: PHRASE_FIXTURE }
    const v = createKit({ plan }); phraseStages(v, act)
    expect(v.stages.find(s => s.sid === 'phrases2').step.phrases.demo).toEqual({ text: 'See you later', key: 'see you later', spare: true })
    expect(v.stages.find(s => s.sid === 'phrases2-ann').demo).toBeUndefined()
    const st = v.stages.find(s => s.sid === 'phrases2'); st.fill(['nice to meet you'])
    expect(st.step.phrases.demo?.text).toBe('See you later') // порядок «слабые последними» демо не теряет
    const t = createKit({ plan, tap: true }); phraseStages(t, act)
    expect(t.stages.find(s => s.sid === 'phrases2').step.phrases.demo).toBeUndefined()
  })
})

describe('демо «Скажи»: скрипт', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('порядок: «главное начать» → слово 1 → «затем второе» → слово 2 → «потом третье» → слово 3 → (больше трёх: «и так до конца» → подряд) → 100 % → взлёт → «теперь ты»', () => {
    const tags = s => s.map(x => (x.line ?? (x.word != null ? `w${x.word}${x.run ? '+' : ''}` : x.all ? 'all' : 'rise')))
    expect(tags(demoPlan(3))).toEqual(['race_demo_1', 'w0', 'race_demo_2', 'w1', 'race_demo_3', 'w2', 'all', 'rise', 'race_demo_go'])
    expect(tags(demoPlan(5))).toEqual(['race_demo_1', 'w0', 'race_demo_2', 'w1', 'race_demo_3', 'w2', 'race_demo_more', 'w3+', 'w4+', 'all', 'rise', 'race_demo_go'])
    expect(tags(demoPlan(2))).toEqual(['race_demo_1', 'w0', 'race_demo_2', 'w1', 'all', 'rise', 'race_demo_go'])
  })
  const setup = (o = {}) => {
    const log = [], shown = [], steps = []
    let busy = o.busy ?? 0
    if (busy) setTimeout(() => { busy = 0 }, busy)
    const sayLine = vi.fn(id => { log.push(`line:${id}`); if (!o.voiced) return false; busy = 1000; setTimeout(() => { busy = 0 }, 1000); return true })
    const sayText = vi.fn((w, opts) => { log.push(`word:${w}`); expect(opts).toMatchObject({ hold: true, tight: true }); opts.onSay?.(400) })
    const onDone = vi.fn(() => log.push('done'))
    const run = runDemoScript({ phrase: { text: o.text ?? 'See you later' }, sayLine, sayText, busyLeft: () => busy, lineText: o.lineText ?? (id => `T(${id})`), hasWord: o.hasWord, show: t => shown.push(t),
      open: (i, v) => log.push(`open:${i}:${v.toFixed(2)}`), all: () => log.push('all'), rise: done => { log.push('rise'); setTimeout(done, 300) }, onDone, onStep: (n, i) => steps.push([n, i]) })
    return { log, shown, run, onDone, sayLine, sayText, steps }
  }
  it('реплики без озвучки — подпись и LINE_SILENT_MS (≤ 700 мс); слово — голос 400 мс + зазор; 3 слова ≈ 4 с до взлёта', () => {
    expect(LINE_SILENT_MS).toBeLessThanOrEqual(700)
    const { log, shown, onDone, sayLine } = setup()
    vi.advanceTimersByTime(0)
    expect(log).toEqual(['line:race_demo_1']); expect(sayLine).toHaveBeenCalledWith('race_demo_1', null, { pause: 0 }); expect(shown.at(-1)).toBe('T(race_demo_1)')
    vi.advanceTimersByTime(LINE_SILENT_MS)
    expect(log.slice(-2)).toEqual(['word:See', 'open:0:0.33'])
    vi.advanceTimersByTime(400 + DEMO_WORD_GAP_MS)
    expect(log.at(-1)).toBe('line:race_demo_2'); expect(shown.at(-1)).toBe('T(race_demo_2)')
    vi.advanceTimersByTime(LINE_SILENT_MS + 400 + DEMO_WORD_GAP_MS + LINE_SILENT_MS)
    expect(log.slice(-5)).toEqual(['word:you', 'open:1:0.67', 'line:race_demo_3', 'word:later', 'open:2:1.00'])
    vi.advanceTimersByTime(400)
    expect(log.slice(-2)).toEqual(['all', 'rise'])
    vi.advanceTimersByTime(300)
    expect(log.at(-1)).toBe('line:race_demo_go'); expect(onDone).not.toHaveBeenCalled()
    vi.advanceTimersByTime(LINE_SILENT_MS)
    expect(onDone).toHaveBeenCalledTimes(1); expect(shown.at(-1)).toBe('')
  })
  it('озвученная реплика — ждём, пока Пит договорит (busyLeft), потом DEMO_LINE_GAP_MS; весь скрипт с репликами по 1 с ≤ 7 с', () => {
    const { log, onDone } = setup({ voiced: true })
    vi.advanceTimersByTime(1000 + DEMO_LINE_GAP_MS - 80)
    expect(log).toEqual(['line:race_demo_1'])
    vi.advanceTimersByTime(140)
    expect(log.at(-1)).toBe('open:0:0.33')
    vi.advanceTimersByTime(7000 - 1000 - DEMO_LINE_GAP_MS - 60)
    expect(onDone).toHaveBeenCalledTimes(1)
  })
  it('озвученная реплика (lineText → \'\') — подписи над лентой нет вовсе', () => {
    const { shown, onDone } = setup({ voiced: true, lineText: () => '' })
    vi.advanceTimersByTime(8000)
    expect(onDone).toHaveBeenCalledTimes(1); expect(shown.every(t => t === '')).toBe(true)
  })
  it('слово без озвучки (hasWord → false) — не звучит, шаг mute, дальше по таймеру DEMO_WORD_MS (без висяка)', () => {
    const { log, sayText, steps, onDone } = setup({ hasWord: w => w !== 'you' })
    vi.advanceTimersByTime(LINE_SILENT_MS + 400 + DEMO_WORD_GAP_MS + LINE_SILENT_MS)
    expect(log.slice(-2)).toEqual(['line:race_demo_2', 'open:1:0.67']); expect(sayText).toHaveBeenCalledTimes(1)
    expect(steps.find(s => s[0] === 'mute')?.[1]).toEqual({ i: 1, word: 'you' })
    vi.advanceTimersByTime(DEMO_WORD_MS + DEMO_WORD_GAP_MS)
    expect(log.at(-1)).toBe('line:race_demo_3')
    vi.advanceTimersByTime(8000); expect(onDone).toHaveBeenCalledTimes(1)
  })
  it('реплики нет в настройках (sayLine → false), а Пит ещё занят — слово ждёт busyLeft, а не звучит поверх', () => {
    const { log } = setup({ busy: 2000 })
    vi.advanceTimersByTime(2000)
    expect(log).toEqual([]) // в начале ждём, пока Пит освободится
    vi.advanceTimersByTime(60)
    expect(log).toEqual(['line:race_demo_1'])
  })
  it('больше трёх слов: после «и так до конца» слова подряд с коротким зазором', () => {
    const { log } = setup({ text: 'Nice to meet you' })
    vi.advanceTimersByTime(3 * (LINE_SILENT_MS + 400 + DEMO_WORD_GAP_MS))
    expect(log.at(-1)).toBe('line:race_demo_more')
    vi.advanceTimersByTime(LINE_SILENT_MS)
    expect(log.slice(-2)).toEqual(['word:you', 'open:3:1.00'])
    expect(DEMO_RUN_GAP_MS).toBeLessThan(DEMO_WORD_GAP_MS)
  })
  it('стоп посреди скрипта: таймеры сняты, подпись снята, onDone не зовётся', () => {
    const { run, onDone, log, shown } = setup()
    vi.advanceTimersByTime(LINE_SILENT_MS + 10)
    run.stop()
    const n = log.length
    vi.advanceTimersByTime(20000)
    expect(log.length).toBe(n); expect(onDone).not.toHaveBeenCalled(); expect(shown.at(-1)).toBe('')
  })
  it('heardUpTo', () => { expect([...heardUpTo(1)]).toEqual([[0, true], [1, true]]) })
})

describe('демо «Скажи»: ворота игры и лимит показов', () => {
  const ph = { text: 'See you later', spare: true }
  it('claim: первый раз за игру — да (счётчик +1), второй — нет; без фразы — нет', () => {
    const storage = memStore(), log = vi.fn(), g = createDemoGate({ storage, log })
    expect(g.claim(null)).toBe(false); expect(g.played()).toBe(false)
    expect(g.claim(ph)).toBe(true); expect(g.active()).toBe(true); expect(demoSeen(storage)).toBe(1)
    expect(log.mock.calls.at(-1)[0]).toBe('[phrase-demo] показ 1/3 на живой пилюле: «See you later» (запасная фраза)')
    expect(g.claim(ph)).toBe(false); expect(demoSeen(storage)).toBe(1)
    g.end(''); expect(g.active()).toBe(false); expect(log.mock.calls.at(-1)[0]).toMatch(/конец/)
  })
  it('обрыв (пауза) — «прервано»; после «Продолжить» демо не повторяется', () => {
    const log = vi.fn(), g = createDemoGate({ storage: memStore(), log })
    g.claim(ph); g.end('пауза')
    expect(log.mock.calls.at(-1)[0]).toBe('[phrase-demo] прервано: пауза')
    expect(g.claim(ph)).toBe(false)
  })
  it(`первые ${DEMO_MAX_SHOWS} игры — демо, дальше пропуск (счётчик ${DEMO_KEY})`, () => {
    const storage = memStore()
    for (let k = 0; k < DEMO_MAX_SHOWS; k++) expect(createDemoGate({ storage }).claim(ph)).toBe(true)
    expect(demoAllowed(storage)).toBe(false)
    const g = createDemoGate({ storage }); expect(g.claim(ph)).toBe(false); expect(g.active()).toBe(false); expect(g.played()).toBe(true)
  })
  it('хранилище бросает или его нет — демо показывается, без ошибок', () => {
    const bad = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } }
    expect(demoSeen(bad)).toBe(0); expect(() => markDemoShown(bad)).not.toThrow(); expect(demoAllowed(null)).toBe(true)
  })
})

describe('демо «Скажи»: код', () => {
  const read = f => readFileSync(new URL(f, import.meta.url), 'utf8')
  it('без Math.random; старой статичной пилюли на плашке нет', () => {
    for (const f of ['./racePhraseDemo.js', './racePhraseDemoTurn.js', './useRacePhraseDemo.js']) expect(read(f)).not.toMatch(/Math\.random\(/)
    expect(read('../../styles/player/modules/race-sprint.css')).not.toContain('race-phrase-demo')
    expect(read('./useRaceActs.js')).not.toMatch(/afterCount: fn => rh\.afterCount\(\(\) => demo/)
  })
})
