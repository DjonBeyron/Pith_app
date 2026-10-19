import { describe, it, expect } from 'vitest'
import { carryOverFiles } from './fileCarryOver.js'

const audio = (id, seq, text, extra = {}) => ({ id, seq, type: 'audio', typeData: { audio: { text, ...extra } } })
const photo = (id, seq, imagePrompt, extra = {}) => ({ id, seq, type: 'photo', typeData: { photo: { imagePrompt, ...extra } } })

describe('перенос файлов при «Заменить урок»', () => {
  it('тот же текст на той же позиции — файл переносится, ничего не удаляется', () => {
    const removed = []
    const out = carryOverFiles([audio('a', 1, 'Привет', { file_id: 'f1' })], [audio('b', 1, 'Привет')], id => removed.push(id))
    expect(out[0].typeData.audio.file_id).toBe('f1'); expect(removed).toEqual([])
  })
  it('позиции съехали (в сценарий вставили ноду) — файл находится по тексту, а не теряется', () => {
    const removed = []
    const prev = [photo('p', 1, 'кот'), audio('a', 2, 'Привет', { file_id: 'f1' }), audio('c', 3, 'Пока', { file_id: 'f2' })]
    const next = [audio('x', 1, 'Привет'), audio('y', 2, 'Пока')]
    const out = carryOverFiles(prev, next, id => removed.push(id))
    expect(out.map(n => n.typeData.audio.file_id)).toEqual(['f1', 'f2']); expect(removed).toEqual([])
  })
  it('текст изменился — старый файл помечается на удаление', () => {
    const removed = []
    carryOverFiles([audio('a', 1, 'Привет', { file_id: 'f1' })], [audio('b', 1, 'Здравствуй')], id => removed.push(id))
    expect(removed).toEqual(['f1'])
  })
  it('новый урок ссылается на файл по r2Url — removeFile получает адреса, которые нельзя трогать', () => {
    const calls = []
    carryOverFiles([audio('a', 1, 'Привет', { file_id: 'f1' })], [audio('b', 1, 'Другое', { r2Url: 'https://r2/x.mp3' })], (id, keep) => calls.push([id, [...keep]]))
    expect(calls).toEqual([['f1', ['https://r2/x.mp3']]])
  })
})
