import { describe, it, expect } from 'vitest'
import { libRow, makeLib, libItems, missingChunks } from './wordLaneLib.js'

const cache = new Map([
  ['i\'m', { key: "i'm", url: 'https://r2/im.mp3', duration: 0.5 }],
  ['trying', { key: 'trying', url: 'https://r2/trying.mp3', duration: null }],
  ['to learn', { key: 'to learn', url: '' }],     // запись без файла — как нет
])
const chunks = ["I’m", 'trying', 'to learn']

describe('озвучка кусков из библиотеки слов', () => {
  it('куски ищутся по wordKey (регистр, типографский апостроф); запись без файла — нет', () => {
    expect(libRow('I’m', cache)).toMatchObject({ key: "i'm" })
    expect(libRow('TRYING!', cache)?.key).toBe('trying')
    expect(libRow('to learn', cache)).toBeNull()
    expect(libRow('привет', cache)).toBeNull()
    expect(libRow('x', null)).toBeNull()
  })
  it('lib(i): длина в мс из библиотеки, null — длина неизвестна; нет куска — null', () => {
    const lib = makeLib(chunks, cache)
    expect(lib(0)).toEqual({ ms: 500, lead: 0 })
    expect(lib(1)).toEqual({ ms: null, lead: 0 })
    expect(lib(2)).toBeNull()
    expect(lib(9)).toBeNull()
  })
  it('что готовить в тапе — уникальные куски с файлом; чего не хватает — для подсказки автору', () => {
    expect(libItems([...chunks, 'trying'], cache)).toEqual([{ key: "i'm", url: 'https://r2/im.mp3' }, { key: 'trying', url: 'https://r2/trying.mp3' }])
    expect(missingChunks(chunks, cache)).toEqual(['to learn'])
  })
})
