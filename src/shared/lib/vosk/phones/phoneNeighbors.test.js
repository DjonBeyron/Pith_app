import { describe, it, expect } from 'vitest'
import { phoneNeighbors, encodePhones, decodePhones, PHONES, SUBS_MAX, PAIRS_MAX } from './phoneNeighbors.js'
import { parsePhones } from './phoneTable.js'
import { EN_PHONES, NOTICE } from './enPhones.js'

// Фонетические соседи (v3.3.185): отчёт владельца — «house» без конца засчитан: буквенные ловушки «hous, housy» не слова, модель их выбросила. Сосед — настоящее слово, которое звучит как обрубок.
const table = parsePhones(EN_PHONES)
const near = (w, skip) => phoneNeighbors(w, table, skip)
const all = w => { const n = near(w); return [...n.prefixes, ...n.subs, ...n.spelled, ...n.pairs] }

describe('фонемы и таблица', () => {
  it('код фонем: по символу на фонему, ударения отброшены, туда и обратно', () => {
    expect(PHONES).toHaveLength(39)
    expect(decodePhones(encodePhones('HH AW1 S'))).toBe('HH AW S')
    expect(encodePhones('HH AW1 S')).toHaveLength(3)
    expect(encodePhones('XX')).toBe(null)
  })
  it('таблица: ≈23 тыс. слов, слова замера на месте, первое произношение — основное; в чанке есть строка об авторстве CMUdict', () => {
    expect(table.prons.size).toBeGreaterThan(20000)
    expect(decodePhones(table.prons.get('house')[0])).toBe('HH AW S')
    expect(decodePhones(table.prons.get('nice')[0])).toBe('N AY S')
    expect(table.words.get(encodePhones('HH AW'))[0]).toBe('how') // среди омофонов (how, hao, hau, howe) первым идёт частое слово
    expect(table.words.get(encodePhones('W IH N'))[0]).toBe('win') // слово с основным произношением раньше слова с запасным (when → «win»)
    expect(NOTICE).toMatch(/Carnegie Mellon University/)
    expect(parsePhones('a:C,M how:PE  bad').prons.size).toBe(2)
  })
})

describe('соседи слова по звуку', () => {
  it('НАЧАЛО — слово, чьё произношение есть начало цели: house → how, nice → nigh, milk → mill, window → wind и win, interesting → interest, wonderful → wonder', () => {
    expect(near('house').prefixes).toEqual(['how'])
    expect(near('nice').prefixes).toEqual(['nigh'])
    expect(near('milk').prefixes).toEqual(['mill'])
    expect(near('window').prefixes).toEqual(['wind', 'win'])
    expect(near('interesting').prefixes).toContain('interest')
    expect(near('wonderful').prefixes).toEqual(['wonder', 'one'])
    expect(near('yesterday').prefixes).toEqual(['yest', 'yes'])
  })
  it('ЗАМЕНА КОНЦА — другой класс звука: nice → nine, knight; cat → can, cam, calf; book → bull, bush; гласная на конце — другая гласная: tree → try, true', () => {
    expect(near('house').subs).toContain('howl')
    expect(near('nice').subs).toEqual(expect.arrayContaining(['nine', 'knight']))
    expect(near('cat').subs).toEqual(expect.arrayContaining(['can', 'cam', 'calf']))
    expect(near('book').subs).toEqual(expect.arrayContaining(['bull', 'bush']))
    expect(near('tree').subs).toEqual(expect.arrayContaining(['try', 'true']))
    expect(near('nice').subs.length).toBeLessThanOrEqual(2 * SUBS_MAX)
  })
  it('длинное слово: редкое слово-начало (breck), начало по буквам — настоящее слово (break), пары из двух слов («breck fuss», «to get», «yes ter»)', () => {
    const b = near('breakfast')
    expect(b.prefixes).toEqual(['breck'])
    expect(b.spelled).toContain('break')
    expect(b.pairs).toContain('breck fuss')
    expect(near('together').pairs).toContain('to get')
    expect(near('yesterday').pairs).toContain('yes ter')
    expect(near('interesting').pairs.length).toBeLessThanOrEqual(PAIRS_MAX)
  })
  it('слова нет в таблице — null (ловушки строятся по буквам, как раньше)', () => {
    expect(near('zzyzx')).toBe(null)
    expect(phoneNeighbors('house', null)).toBe(null)
  })
})

describe('защита целого слова: сосед не должен его красть', () => {
  it('омофон цели — не сосед (night ↔ knight), два омофона вместе не берутся (mil и mill делили бы уверенность Vosk пополам)', () => {
    expect(all('night')).not.toContain('knight')
    expect(all('knight')).not.toContain('night')
    const m = all('milk')
    expect(m).toContain('mill'); expect(m).not.toContain('mil')
    const codes = all('nice').filter(w => !w.includes(' ')).map(w => table.prons.get(w)[0])
    expect(new Set(codes).size).toBe(codes.length)
  })
  it('замена внутри класса звука не берётся (cat ↔ cap, cab, cad: t и p на слух слишком близки); согласная внутри слова не заменяется (water → wall, war крали целое слово)', () => {
    const c = all('cat')
    for (const w of ['cap', 'cab', 'cad', 'catch']) expect(c).not.toContain(w)
    const w = all('water')
    expect(w).toEqual(['wat'])
  })
  it('начало из двух фонем — только когда длиннее нет: water → wat без waugh (короткое начало крало целое слово: 7 целых «water» из 12, без него 10), house → how остаётся', () => {
    expect(near('water').prefixes).not.toContain('waugh')
    expect(near('together').prefixes).toEqual(['tug'])
    expect(near('house').prefixes).toEqual(['how'])
  })
  it('слова целей (skip) в соседи не идут; каждое слово соседа — слово таблицы (модель его не выбросит); грубых слов в таблице нет', () => {
    expect(phoneNeighbors('window', table, new Set(['win'])).prefixes).toEqual(['wind', 'when'])
    for (const t of ['house', 'nice', 'from', 'cat', 'dog', 'tree', 'book', 'milk', 'water', 'apple', 'window', 'breakfast', 'yesterday', 'together', 'interesting', 'wonderful']) {
      for (const d of all(t)) for (const w of d.split(' ')) { expect(table.prons.has(w), `${t} → ${d}`).toBe(true); expect(w).not.toBe(t) }
    }
    for (const w of ['fuck', 'shit']) expect(table.prons.has(w)).toBe(false)
  })
})
