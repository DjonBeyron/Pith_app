import { describe, it, expect } from 'vitest'
import { createGate, GATE_RMS, GATE_KEEP_MS, GATE_PREROLL_MS } from './voskGate.js'
import { createEarVoice } from './voskVoice.js'

const MS = 128
const run = (g, list, opts, ms = MS) => list.map(r => g.push(r, ms, opts))

describe('voskGate: долгую тишину декодеру не отдаём', () => {
  it('голос и тихий, но не нулевой звук проходят; тишину отдаём не дольше GATE_KEEP_MS, дальше режем', () => {
    const g = createGate()
    expect(run(g, [0.2, GATE_RMS, 0.02]).every(x => x.feed)).toBe(true)
    const quiet = run(createGate(), Array(10).fill(0))
    const fed = quiet.filter(x => x.feed).length * MS
    expect(fed).toBeGreaterThanOrEqual(GATE_KEEP_MS)
    expect(fed).toBeLessThan(500) // короче самого короткого правила эндпойнта Vosk
    expect(quiet.slice(3).every(x => !x.feed)).toBe(true)
  })
  it('голос вернулся после обрезанной паузы: предыдущий (не отданный) кусок уходит предзвуком; счётчик пропущенного его не включает', () => {
    const g = createGate()
    run(g, Array(10).fill(0)) // 3 отдано, 7 пропущено
    expect(g.droppedMs).toBe(7 * MS)
    const back = g.push(0.1, MS)
    expect(back).toMatchObject({ feed: true, preroll: 1 }) // кусок 128 мс длиннее GATE_PREROLL_MS — один кусок, как раньше
    expect(g.droppedMs).toBe(6 * MS)
    expect(g.push(0.1, MS).preroll).toBe(0)
  })
  it('любой громкий кусок обнуляет счёт тишины: паузы по 0,3 с, разделённые звуком, не режутся', () => {
    const g = createGate()
    const out = []
    for (let i = 0; i < 6; i++) out.push(g.push(0, MS), g.push(0, MS), g.push(0.05, MS))
    expect(out.every(x => x.feed && !x.preroll)).toBe(true)
    expect(g.droppedMs).toBe(0)
  })
  it('open (фраза услышана вся) — затвор открыт: пусть движок заканчивает сам', () => {
    const g = createGate()
    expect(run(g, Array(10).fill(0), { open: true }).every(x => x.feed)).toBe(true)
    expect(g.droppedMs).toBe(0)
  })
})

// v3.3.186: отчёт владельца, iPhone — речь rms 0,003–0,005 при фоне 0,0003; жёсткий порог 0,006 не пускал её в Vosk (20 попыток «nice» — 0 зачётов, gatedMs ≈ весь заход)
describe('voskGate: порог — от шума микрофона (как у правила слова), а не константа', () => {
  const CH = 43 // кусок слушателя слов: 2048 кадров при 48 кГц
  const NOISE = 0.0003
  it('тихая речь (0,003–0,005 при фоне 0,0003) идёт в Vosk вся: ни одного куска голоса мимо', () => {
    const g = createGate()
    run(g, Array(40).fill(NOISE), undefined, CH) // 1,7 с тишины: затвор закрылся
    expect(g.droppedMs).toBeGreaterThan(1000)
    const word = run(g, [0.0031, 0.0042, 0.005, 0.0045, 0.0034, 0.002, 0.0012], undefined, CH) // «nice»: пик 0,005, хвост «s» 0,0012
    expect(word.every(x => x.feed)).toBe(true)
    expect(word.every(x => x.voice)).toBe(true) // тихий хвост — голос по гистерезису (доля пика), как у правила слова
  })
  it('тихое начало слова не теряется: перед первым куском голоса уходит предзвук GATE_PREROLL_MS (нарастание 0,0009 → 0,0018 ниже порога начала)', () => {
    const g = createGate()
    run(g, Array(40).fill(NOISE), undefined, CH)
    const rise = run(g, [0.0009, 0.0012, 0.0015, 0.0018], undefined, CH) // «s…» / «h…»: тише порога начала голоса 0,002
    expect(rise.every(x => !x.feed)).toBe(true)
    const first = g.push(0.0057, CH)
    expect(first).toMatchObject({ feed: true, voice: true, preroll: Math.floor(GATE_PREROLL_MS / CH) })
    expect(first.preroll * CH).toBeGreaterThanOrEqual(4 * CH - 1) // всё нарастание (4 куска) ушло в Vosk
    expect(GATE_KEEP_MS + GATE_PREROLL_MS).toBeLessThan(500) // хвост + предзвук подряд — короче правила эндпойнта: пауза между словами заход не рвёт
  })
  it('долгая тишина режется, как раньше: фон 0,0003 и шорох ниже порога начала (0,0015) в Vosk не идут; хвост GATE_KEEP_MS после голоса — идёт', () => {
    const g = createGate()
    run(g, Array(10).fill(NOISE), undefined, CH)
    run(g, [0.004, 0.005, 0.004], undefined, CH)
    const tail = run(g, Array(30).fill(NOISE), undefined, CH)
    const fed = tail.filter(x => x.feed).length * CH
    expect(fed).toBeGreaterThanOrEqual(GATE_KEEP_MS)
    expect(fed).toBeLessThan(GATE_KEEP_MS + 2 * CH)
    expect(run(g, [0.0015, NOISE, 0.0015, NOISE], undefined, CH).some(x => x.feed)).toBe(false)
  })
  it('шумный микрофон (фон 0,004): порог от шума был бы 0,016, но страховка GATE_RMS держит прежнее поведение — речь 0,008 идёт в Vosk', () => {
    const g = createGate()
    run(g, Array(40).fill(0.004), undefined, CH)
    expect(g.droppedMs).toBeGreaterThan(1000)
    expect(g.push(0.008, CH)).toMatchObject({ feed: true, voice: false })
  })
  it('voice — счётчик голоса вызывающего (слушатель слов отдаёт счётчик правила слова): что он назвал голосом, то ушло в Vosk', () => {
    let t = 0
    const voice = createEarVoice({ now: () => t }), g = createGate({ voice })
    const push = rms => { t += CH; voice.push(rms); return g.push(rms, CH) }
    for (let i = 0; i < 40; i++) push(NOISE)
    const out = [0.0035, 0.0045, 0.003, 0.001].map(push)
    expect(out.map(x => x.voice)).toEqual([true, true, true, true])
    expect(out.every(x => x.feed)).toBe(true)
  })
})
