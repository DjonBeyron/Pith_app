import { describe, it, expect } from 'vitest'
import {
  buildCodeTrack, codeAtTrack, createCodePicker, gateCode, foldCode, isCode, FOLD, LESS_OPEN, CODES, MIN_HOLD, GENERIC,
} from './mouthVisemes.js'
import { envelopeLevels, levelAt } from '../../../shared/lib/audioEnvelope.js'
import { SCENE_OPEN_AT as OPEN_AT, SCENE_HALF_AT as HALF_AT } from '../../../shared/lib/mouthLevels.js'

const w = (word, start, end) => ({ word, start, end })

describe('mouthVisemes — дорожка кодов по буквам', () => {
  it('буквы слова ложатся на его отрезок: «мама» — A D A D; отрезки по порядку, без перекрытий, в пределах слова', () => {
    const tr = buildCodeTrack([w('мама', 1, 2)])
    expect(tr.map(s => s.code)).toEqual(['A', 'D', 'A', 'D'])
    expect(tr[0].at).toBeCloseTo(1)
    expect(tr.at(-1).end).toBeCloseTo(2)
    for (let i = 1; i < tr.length; i++) expect(tr[i].at).toBeGreaterThanOrEqual(tr[i - 1].end - 1e-9)
  })

  it('«о» круглит рот (E), «у» — трубочка (F), «ф» — G, «л» — H; соседние одинаковые формы склеены', () => {
    expect(buildCodeTrack([w('о', 0, 1)]).map(s => s.code)).toEqual(['E'])
    expect(buildCodeTrack([w('ту', 0, 1)]).map(s => s.code)).toEqual(['B', 'F'])
    expect(buildCodeTrack([w('фл', 0, 1)]).map(s => s.code)).toEqual(['G', 'H'])
    // «tt» → две B подряд = один отрезок
    expect(buildCodeTrack([w('tt', 0, 1)])).toHaveLength(1)
  })

  it('форма держится не меньше 70 мс: короткий отрезок отдаёт время более длинному соседу', () => {
    // «bat» на 0,15 с: b (A), a (D), t (B) — по ~0,05 с каждая → слипаются, ни один отрезок короче MIN_HOLD
    const tr = buildCodeTrack([w('bat', 0, 0.15)])
    expect(tr.length).toBeLessThan(3)
    for (const s of tr) expect(s.end - s.at).toBeGreaterThanOrEqual(MIN_HOLD - 1e-6)
    expect(tr[0].at).toBeCloseTo(0)
    expect(tr.at(-1).end).toBeCloseTo(0.15)
    // Длинное слово: все отрезки ≥ 70 мс, покрывают слово без дыр
    const long = buildCodeTrack([w('привет', 0, 0.6)])
    for (const s of long) expect(s.end - s.at).toBeGreaterThanOrEqual(MIN_HOLD - 1e-6)
    for (let i = 1; i < long.length; i++) expect(long[i].at).toBeCloseTo(long[i - 1].end)
  })

  it('английское слово — по сочетаниям букв, как у кота «Поворота телефона»: «learn» — H E B (округлое «ear»), «nice» — B D B (немое e); русское по-прежнему по буквам', () => {
    expect(buildCodeTrack([w('learn', 0, 0.8)]).map(s => s.code)).toEqual(['H', 'E', 'B'])
    expect(buildCodeTrack([w('nice', 0, 0.8)]).map(s => s.code)).toEqual(['B', 'D', 'B'])
    expect(buildCodeTrack([w('Learn,', 0, 0.8)]).map(s => s.code)).toEqual(['H', 'E', 'B'])   // регистр и знаки не мешают
    expect(buildCodeTrack([w('мама', 0, 0.8)]).map(s => s.code)).toEqual(['A', 'D', 'A', 'D'])
  })

  it('слово короче 70 мс остаётся одним отрезком (его не выбросить)', () => {
    const tr = buildCodeTrack([w('a', 0, 0.04)])
    expect(tr).toHaveLength(1)
    expect(tr[0].code).toBe('D')
  })

  it('в паузах между словами — X; пауза короче 70 мс рот не закрывает (прошлая форма доезжает до следующего слова)', () => {
    const tr = buildCodeTrack([w('мама', 0, 0.4), w('папа', 0.6, 1)])
    expect(codeAtTrack(tr, 0.5)).toBe('X')
    expect(codeAtTrack(tr, -0.1)).toBe('X')
    expect(codeAtTrack(tr, 1.2)).toBe('X')
    expect(codeAtTrack(tr, 0.05)).not.toBe('X')
    const fast = buildCodeTrack([w('мама', 0, 0.4), w('папа', 0.43, 0.8)])
    expect(codeAtTrack(fast, 0.41)).not.toBe('X')
    expect(codeAtTrack(fast, 0.41)).toBe('D')
  })

  it('слово без букв («5») даёт общую форму; негодные тайминги пропускаются; пусто — пустая дорожка', () => {
    expect(buildCodeTrack([w('5', 0, 0.3)]).map(s => s.code)).toEqual([GENERIC])
    expect(buildCodeTrack([null, w('a', 1, 0.5), w('x', NaN, 1), w('мама', 0, 0.4)]).every(s => s.w === 3)).toBe(true)
    expect(buildCodeTrack(null)).toEqual([])
    expect(buildCodeTrack([])).toEqual([])
  })

  it('индекс слова w в отрезках — для зрачков на границах слов', () => {
    const tr = buildCodeTrack([w('раз', 0, 0.4), w('два', 0.6, 1)])
    expect(new Set(tr.map(s => s.w))).toEqual(new Set([0, 1]))
  })
})

describe('mouthVisemes — свёртка кода и «полуоткрытая» таблица', () => {
  it('каждый из 9 кодов сворачивается в closed / half / open (рот обычного кота)', () => {
    expect(CODES).toHaveLength(9)
    for (const c of CODES) expect(['closed', 'half', 'open']).toContain(foldCode(c))
    expect(foldCode('X')).toBe('closed')
    expect(foldCode('A')).toBe('closed')
    expect(foldCode('D')).toBe('open')
    expect(foldCode('E')).toBe('open')
    expect(foldCode('B')).toBe('half')
    expect(foldCode('?')).toBe('closed')
    expect(Object.keys(FOLD)).toEqual(CODES)
  })

  it('isCode узнаёт только однобуквенные коды Rhubarb', () => {
    expect(['X', 'A', 'H'].every(isCode)).toBe(true)
    expect(['open', 'half', 'closed', 'a', 'Z', '', null, 5].some(isCode)).toBe(false)
  })

  it('таблица «полуоткрытая»: D→C, E→C, C→B, F→B, H→C; закрытые A, B, G и X не меняются; результат никогда не открытее исходного', () => {
    expect(LESS_OPEN).toMatchObject({ D: 'C', E: 'C', C: 'B', F: 'B', H: 'C', A: 'A', B: 'B', G: 'G', X: 'X' })
    const rank = { X: 0, A: 0, G: 1, B: 1, C: 2, F: 2, E: 3, H: 3, D: 4 }
    for (const c of CODES) expect(rank[LESS_OPEN[c]]).toBeLessThanOrEqual(rank[c])
  })
})

describe('mouthVisemes — гейт по громкости и выбор формы', () => {
  it('тише HALF_AT → X; от HALF_AT до OPEN_AT — полуоткрытая версия; громче — код как есть; X всегда X', () => {
    expect(gateCode('D', HALF_AT - 0.01)).toBe('X')
    expect(gateCode('D', 0)).toBe('X')
    expect(gateCode('D', HALF_AT)).toBe('C')
    expect(gateCode('E', OPEN_AT - 0.01)).toBe('C')
    expect(gateCode('D', OPEN_AT)).toBe('D')
    expect(gateCode('D', 1)).toBe('D')
    expect(gateCode('X', 1)).toBe('X')
    expect(gateCode('A', 0.3)).toBe('A')
  })

  // Огибающая: громкая вторая половина секунды (hz 4: окна 0,25 с)
  const lv = envelopeLevels({ hz: 4, data: '00ff' })
  const track = buildCodeTrack([w('да', 0, 1)])

  it('picker: без огибающей — только буквы; с огибающей тихие окна дают X', () => {
    const plain = createCodePicker(track)
    expect(plain.pick(0.1).code).toBe('B')
    const gated = createCodePicker(track, lv)
    expect(gated.pick(0.1).code).toBe('X')       // окно 0 тихое
    expect(gated.pick(0.9).code).toBe('D')       // громко: «а» как есть
    expect(gated.pick(0.9).word).toBe(0)
    expect(gated.pick(1.5)).toEqual({ code: 'X', word: -1 })
  })

  it('picker держит форму не меньше MIN_HOLD: дребезг гейта у порога не мерцает; перемотка назад сбрасывает', () => {
    const t2 = buildCodeTrack([w('aaaaaaaa', 0, 1)])  // одна форма D на всё слово
    const flicker = envelopeLevels({ hz: 40, data: '90' + '9'.repeat(38) }) // окно 1 (25–50 мс) вдруг тихое
    expect(gateCode('D', levelAt(flicker, 0.0375))).toBe('X')                // без удержания рот бы мигнул
    const p = createCodePicker(t2, flicker)
    const seen = []
    for (let t = 0.01; t < 0.2; t += 0.01) seen.push(p.pick(t).code)
    expect(new Set(seen)).toEqual(new Set(['D']))
    const q = createCodePicker(track)
    q.pick(0.9)
    expect(q.pick(0.1).code).toBe('B')           // перемотка назад — снова с начала слова
  })
})
