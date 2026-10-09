import { describe, it, expect } from 'vitest'
import {
  SERIES_KEY, DEFAULT_REFS, wrongPhrase, stepCaption, replaceWord, defaultConfig, emptyState, readState, writeState, sanitizeState,
  buildRow, recordEntry, rowsOf, clearLang, conclusions, seriesLines, wordCount,
} from './contextSeries.js'

function memStore(initial = {}) {
  const m = new Map(Object.entries(initial))
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }
}

// Запись журнала шага серии: top1 — что услышали, wrongTop — top-1 буквально «try», conf — уверенность %
const entryOf = (step, { lang = 'en-US', top1, conf, wrongTop = false, fixed = false, literal = [], ok = true } = {}) => ({
  t: 100 + step,
  tx: {
    ref: DEFAULT_REFS[step], said: 'x', lang, series: { step, wrongPhrase: 'x' }, top1: { text: top1, conf }, alts: [{ text: top1, conf }, { text: 'alt', conf: 10 }],
    literal: wrongTop ? ['top1', ...literal] : literal, verdicts: { top1: !wrongTop && ok, consensus: false, strict: false }, fixed, dir: null,
  },
})

describe('ошибочная фраза шага и подписи', () => {
  it('«I\'m trying» → «I\'m try»; слова нет в эталоне → null', () => {
    expect(wrongPhrase("I'm trying", 'trying', 'try')).toBe("I'm try")
    expect(wrongPhrase('trying', 'trying', 'try')).toBe('try')
    expect(wrongPhrase("I'm trying to please both", 'trying', 'try')).toBe("I'm try to please both")
    expect(wrongPhrase('hello', 'trying', 'try')).toBeNull()
  })
  it('подпись шага', () => {
    expect(stepCaption(defaultConfig(), 1)).toBe("скажи: «I'm try» (с ошибкой try)")
    expect(stepCaption({ ...defaultConfig(), word: 'going' }, 1)).toContain('нет слова «going»')
  })
  it('4 эталона по умолчанию растут по длине: 1, 2, 4, 5 слов', () => {
    expect(DEFAULT_REFS.map(wordCount)).toEqual([1, 2, 4, 5])
  })
  it('подстановка своего слова во все эталоны', () => {
    const c = replaceWord(defaultConfig(), 'going', 'go')
    expect(c.refs).toEqual(['going', "I'm going", "I'm going to please", "I'm going to please both"])
    expect(c.wrong).toBe('go')
    expect(replaceWord(defaultConfig(), '', 'go')).toEqual(defaultConfig())
  })
})

describe('хранение', () => {
  it('битое/пустое → по умолчанию; круг записи/чтения; мусор отбрасывается', () => {
    expect(readState(memStore())).toEqual(emptyState())
    expect(readState(memStore({ [SERIES_KEY]: '{oops' }))).toEqual(emptyState())
    const s = memStore()
    const st = recordEntry(emptyState(), entryOf(0, { top1: 'try', conf: 62, wrongTop: true }))
    writeState(st, s)
    expect(readState(s)).toEqual(st)
    expect(sanitizeState({ cfg: { refs: ['a'] }, langs: { 'en-US': { 9: {}, 1: { n: 2 }, 2: 5 } } }).langs).toEqual({ 'en-US': { 1: { n: 2 } } })
  })
})

describe('результаты серии', () => {
  it('top-1 литерально → «wrong»; эталон подтверждён → «ref»; иначе «other»', () => {
    expect(buildRow(entryOf(1, { top1: "I'm try", conf: 54, wrongTop: true })).kind).toBe('wrong')
    expect(buildRow(entryOf(1, { top1: "I'm trying", conf: 97 })).kind).toBe('ref')
    expect(buildRow(entryOf(1, { top1: 'hello', conf: 30, ok: false })).kind).toBe('other')
  })
  it('не серия / нет итога → состояние без изменений; повтор шага заменяет прежний', () => {
    const st = emptyState()
    expect(recordEntry(st, { t: 1, tx: { top1: { text: 'a' }, series: null } })).toBe(st)
    expect(recordEntry(st, { t: 1 })).toBe(st)
    expect(recordEntry(st, { t: 1, tx: { ...entryOf(0, { top1: 'x' }).tx, top1: null } })).toBe(st)
    let s = recordEntry(st, entryOf(1, { top1: "I'm try", conf: 40, wrongTop: true }))
    s = recordEntry(s, entryOf(1, { top1: "I'm trying", conf: 90 }))
    expect(rowsOf(s, 'en-US')).toHaveLength(1)
    expect(rowsOf(s, 'en-US')[0].kind).toBe('ref')
  })
  it('языки хранятся раздельно; очистка языка', () => {
    let s = recordEntry(emptyState(), entryOf(0, { top1: 'try', conf: 60, wrongTop: true }))
    s = recordEntry(s, entryOf(0, { lang: 'en-GB', top1: 'trying', conf: 80 }))
    expect(Object.keys(s.langs).sort()).toEqual(['en-GB', 'en-US'])
    expect(Object.keys(clearLang(s, 'en-US').langs)).toEqual(['en-GB'])
  })
  it('строки отсортированы по длине контекста', () => {
    let s = emptyState()
    for (const i of [3, 0, 2, 1]) s = recordEntry(s, entryOf(i, { top1: 'x', conf: 50, wrongTop: true }))
    expect(rowsOf(s, 'en-US').map(r => r.n)).toEqual([1, 2, 4, 5])
  })
})

describe('выводы', () => {
  const build = specs => {
    let s = emptyState()
    specs.forEach((sp, i) => { s = recordEntry(s, entryOf(i, sp)) })
    return rowsOf(s, 'en-US')
  }
  it('исправление начинается с 4 слов, зависимость от уверенности есть', () => {
    const rows = build([
      { top1: 'try', conf: 36, wrongTop: true }, { top1: "I'm try", conf: 54, wrongTop: true },
      { top1: "I'm trying to please", conf: 86 }, { top1: "I'm trying to please both", conf: 97 },
    ])
    const c = conclusions(rows).join('\n')
    expect(c).toContain('Исправление начинается с 4 сл.')
    expect(c).toContain('буквальные 36–54%')
    expect(c).toContain('исправленные 86–97%')
    expect(c).toContain('ЗАВИСИТ')
  })
  it('исправления нет ни при какой длине; один вид результатов — уверенность не оценить', () => {
    const c = conclusions(build([{ top1: 'try', conf: 60, wrongTop: true }, { top1: "I'm try", conf: 62, wrongTop: true }])).join('\n')
    expect(c).toContain('ни при одной длине')
    expect(c).toContain('не оценить')
  })
  it('уже на самом коротком; не монотонно; ошибочная форма осталась в N-best при исправленном top-1', () => {
    const c = conclusions(build([{ top1: 'trying', conf: 90, literal: ['alt#2'] }, { top1: "I'm try", conf: 50, wrongTop: true }])).join('\n')
    expect(c).toContain('уже при самом коротком')
    expect(c).toContain('Не монотонно')
    expect(c).toContain('alt#2')
    expect(conclusions([])[0]).toContain('Данных нет')
  })
})

describe('текст «Скопировать итог серии»', () => {
  it('таблица по языкам + выводы + сравнение языков', () => {
    let s = emptyState()
    s = recordEntry(s, entryOf(1, { top1: "I'm try", conf: 54, wrongTop: true, literal: ['interim@1.0s'] }))
    s = recordEntry(s, entryOf(3, { top1: "I'm trying to please both", conf: 97, fixed: true }))
    s = recordEntry(s, entryOf(3, { lang: 'en-GB', top1: "I'm try to please both", conf: 60, wrongTop: true }))
    const t = seriesLines(s).join('\n')
    expect(t).toContain('en-US:')
    expect(t).toContain('en-GB:')
    expect(t).toContain("2 сл. | ref=«I'm trying» said=«x» | top1=«I'm try» 54% буквально | top1=поймало")
    expect(t).toContain('исправлено (interim исправлен)')
    expect(t).toContain('Сравнение: en-US — исправление с 5 сл.; en-GB — исправление нет')
    expect(seriesLines(emptyState()).join('\n')).toContain('результатов пока нет')
  })
})
