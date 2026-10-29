import { describe, it, expect } from 'vitest'
import { wordShapes, wordSegments, wordWeight } from './visemeLetters.js'
import { DIGRAPHS } from './visemeEnglish.js'

// Форма рта по сочетаниям букв: «learn» = «лёрн» (округлый рот), а не побуквенное C→D→B
const raw = w => wordShapes(w).map(s => s.code ?? '-').join('')       // формы по порядку (немые — «-»)
const merged = w => wordSegments(w, 0, 1000).map(s => s.code).join('') // отрезки на экране: одинаковые подряд склеены

describe('английские слова: формы рта по сочетаниям букв', () => {
  it('learn → H,E,B («ear» даёт округлый E и лёгкое «р», а не C→D→B)', () => {
    expect(merged('learn')).toBe('HEB')
    expect(raw('learn')).toBe('HEBB')
  })
  it('trying → B,B,D,B,B: t, r, дифтонг y = D→B, «ing»', () => {
    expect(raw('trying')).toBe('BBDBB')
    expect(merged('trying')).toBe('BDB')
  })
  it('nice → B,D,B: i_e — дифтонг D→B, немое e формы не имеет', () => {
    expect(raw('nice')).toBe('BDBB-')
    expect(merged('nice')).toBe('BDB')
  })
  it('you → F: «y» перед гласной не рот, «ou» после y — трубочка', () => {
    expect(raw('you')).toBe('-F')
    expect(merged('you')).toBe('F')
  })
  it('coffee → B,E,G,B: удвоенное ff звучит как одно, ee — «зубы рядом» (как у Rhubarb)', () => {
    expect(raw('coffee')).toBe('BEGB')
  })
  it('world → F,E,B,H,B: w — трубочка, or — округлый E и «р», l — язык', () => {
    expect(merged('world')).toBe('FEBHB')
  })
  it('really → B,C,H,B: ea — полуоткрытый C, ll — одно L, конечное y после других гласных — B', () => {
    expect(merged('really')).toBe('BCHB')
  })

  it('сочетания из таблицы: er/ir/ur/or → E; oo, ew, ue → F; oa, aw, au → E; th → H; sh/ch → B; wh, qu → F; ng, ck → B', () => {
    for (const w of ['her', 'bird', 'turn', 'for']) expect(merged(w)).toMatch(/E/)
    expect(merged('moon')).toBe('AFB')
    expect(merged('new')).toBe('BF')
    expect(merged('blue')).toBe('AHF')
    expect(merged('boat')).toBe('AEB')
    expect(merged('saw')).toBe('BE')
    expect(merged('think')).toBe('HCB')
    expect(merged('ship')).toBe('BCA')
    expect(merged('what')).toBe('FDB')
    expect(merged('quick')).toBe('FCB')
    expect(merged('back')).toBe('ADB')
    expect(DIGRAPHS.th[0].code).toBe('H')
  })

  it('дифтонги — две формы подряд: ai/ay/ei/ey → C,B; igh и y в односложном слове → D,B; ou/ow → E,F; oi/oy → E,B', () => {
    expect(raw('rain')).toBe('BCBB')
    expect(merged('day')).toBe('BCB')
    expect(raw('night')).toBe('BDBB')
    expect(raw('my')).toBe('ADB')
    expect(merged('out')).toBe('EFB')
    expect(merged('now')).toBe('BEF')
    expect(merged('boy')).toBe('AEB')
  })

  it('y: в начале слова перед гласной молчит (yes), в многосложном слове на конце — B (happy), «I» и «I\'m» — /aɪ/', () => {
    expect(raw('yes')).toBe('-CB')
    expect(raw('happy')).toBe('BDAB')
    expect(raw('I')).toBe('DB')
    expect(raw("I'm")).toBe('DBA')
  })

  it('немое e в конце: nice, make, home, here — формы нет; в «the», «he», «me» e остаётся; «are» — без дифтонга', () => {
    for (const w of ['nice', 'make', 'home', 'here', 'phone']) expect(raw(w).endsWith('-')).toBe(true)
    expect(raw('the')).toBe('HC')
    expect(raw('he')).toBe('BC')
    expect(raw('are')).toBe('DB-')
    expect(raw('have')).not.toMatch(/C/)
  })

  it('немое e отдаёт время предыдущей форме: «home» — гласная держится дольше, чем в «hom»', () => {
    const e = word => { const s = wordSegments(word, 0, 1000).find(x => x.code === 'E'); return s.end - s.at }
    expect(e('home')).toBeGreaterThan(e('hom'))
    expect(wordSegments('home', 0, 1000).at(-1).end).toBeCloseTo(1000) // слово занимает весь отрезок
  })

  it('вес: дифтонги и долгие гласные длиннее согласных; сумма весов = wordWeight; отрезки покрывают слово без дыр', () => {
    const segs = wordSegments('learn', 100, 700)
    expect(segs[0].at).toBeCloseTo(100)
    expect(segs.at(-1).end).toBeCloseTo(700)
    for (let i = 1; i < segs.length; i++) expect(segs[i].at).toBeCloseTo(segs[i - 1].end)
    const e = segs.find(s => s.code === 'E')
    const h = segs.find(s => s.code === 'H')
    expect(e.end - e.at).toBeGreaterThan(h.end - h.at)
    expect(wordWeight('learn')).toBeCloseTo(wordShapes('learn').reduce((a, s) => a + s.w, 0))
    expect(wordWeight('moon')).toBeGreaterThan(wordWeight('mn'))
  })

  it('регистр не важен, знаки препинания отбрасываются; цифры и пустое — пусто', () => {
    expect(merged('LEARN')).toBe('HEB')
    expect(merged('Learn,')).toBe('HEB')
    expect(wordShapes('123')).toEqual([])
    expect(wordSegments('!!!', 0, 100)).toEqual([])
    expect(wordSegments('learn', 100, 100)).toEqual([])
  })

  it('русские слова — по буквам, как раньше (мама → A D A D); смешанное слово тоже по буквам', () => {
    expect(wordShapes('мама').map(s => s.code)).toEqual(['A', 'D', 'A', 'D'])
    expect(wordShapes('привет').map(s => s.code)).toEqual(['A', 'B', 'B', 'G', 'C', 'B'])
    expect(wordShapes('abcд').length).toBe(4)
  })
})
