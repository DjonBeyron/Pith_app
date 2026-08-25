import { describe, it, expect } from 'vitest'
import { cellMatchesWord, deriveAnswerTokens, normalizeAnswerText } from './tableCellMatch.js'

const plain   = { id: 'c1', value: 'am' }
const special = { id: 'c2', value: 'he/she/it', options: ['he', 'she', 'it'] }

describe('слово ответа и ячейка', () => {
  it('обычная ячейка — по своему тексту', () => {
    expect(cellMatchesWord(plain, 'am')).toBe(true)
    expect(cellMatchesWord(plain, 'is')).toBe(false)
  })

  it('особая ячейка — по любому из своих вариантов', () => {
    // ровно случай из урока: в ответе «he», а в ячейке написано «he/she/it»
    expect(cellMatchesWord(special, 'he')).toBe(true)
    expect(cellMatchesWord(special, 'it')).toBe(true)
    expect(cellMatchesWord(special, 'they')).toBe(false)
  })

  it('её собственный текст тоже подходит', () => {
    expect(cellMatchesWord(special, 'he/she/it')).toBe(true)
  })

  it('регистр и вид апострофа значения не имеют', () => {
    expect(cellMatchesWord({ id: 'x', value: "I'm" }, 'I\u2019M')).toBe(true)
    expect(normalizeAnswerText('  He   SHE ')).toBe('he she')
  })
})

describe('разбор ответа на токены', () => {
  const cells = [plain, special]

  it('особая ячейка попадает в сборку, а не уходит в чипы', () => {
    const tokens = deriveAnswerTokens('he am', cells)
    expect(tokens).toEqual([
      { type: 'cell', cellId: 'c2', value: 'he' },
      { type: 'cell', cellId: 'c1', value: 'am' },
    ])
  })

  it('у токена особой ячейки значение — выбранный вариант, а не весь текст', () => {
    expect(deriveAnswerTokens('she', cells)[0].value).toBe('she')
  })

  it('одна ячейка занимается один раз — повтор уходит в слова вне таблицы', () => {
    const tokens = deriveAnswerTokens('he he', cells)
    expect(tokens[0]).toEqual({ type: 'cell', cellId: 'c2', value: 'he' })
    expect(tokens[1]).toEqual({ type: 'extra', value: 'he' })
  })

  it('слова не из таблицы остаются словами вне её', () => {
    expect(deriveAnswerTokens("am I'm", cells)[1]).toEqual({ type: 'extra', value: "I'm" })
  })

  it('пустой ответ — пустой разбор', () => {
    expect(deriveAnswerTokens('', cells)).toEqual([])
    expect(deriveAnswerTokens(null, cells)).toEqual([])
  })
})

describe('разбор один на всех', () => {
  it('его используют обе панели плеера и редактор таймлайна', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
    for (const f of [
      '../../features/player/panels/table-manual/TableManualPanel.jsx',
      '../../features/player/panels/table-dictator/TableDictatorPanel.jsx',
      '../../features/canvas/table-editor/tableGridUtils.js',
    ]) {
      expect(read(f)).toContain('deriveAnswerTokens')
      expect(read(f)).not.toContain('function deriveTokens(')
    }
  })
})

describe('ячейка из нескольких слов', () => {
  const me    = { id: 'm', value: 'I' }
  const will  = { id: 'w', value: 'will try' }
  const cells = [me, will]

  it('«I will try again»: обе ячейки найдены, вне таблицы только «again»', () => {
    expect(deriveAnswerTokens('I will try again', cells)).toEqual([
      { type: 'cell', cellId: 'm', value: 'I' },
      { type: 'cell', cellId: 'w', value: 'will try' },
      { type: 'extra', value: 'again' },
    ])
  })

  it('регистр не мешает: «i WILL TRY» — те же две ячейки', () => {
    const tokens = deriveAnswerTokens('i WILL TRY', cells)
    expect(tokens.map(t => t.cellId)).toEqual(['m', 'w'])
  })

  it('жадно: длинная ячейка побеждает короткую с тем же началом', () => {
    const short = { id: 's', value: 'will' }
    const tokens = deriveAnswerTokens('will try', [short, will])
    expect(tokens).toEqual([{ type: 'cell', cellId: 'w', value: 'will try' }])
  })

  it('длинная занята — разбор падает до короткой', () => {
    const short = { id: 's', value: 'will' }
    const tokens = deriveAnswerTokens('will try will', [short, will])
    expect(tokens).toEqual([
      { type: 'cell', cellId: 'w', value: 'will try' },
      { type: 'cell', cellId: 's', value: 'will' },
    ])
  })

  it('многословный вариант особой ячейки тоже находится', () => {
    const opt = { id: 'o', value: '…', options: ['will try', 'will go'] }
    expect(deriveAnswerTokens('will go', [opt])).toEqual([
      { type: 'cell', cellId: 'o', value: 'will go' },
    ])
  })
})
