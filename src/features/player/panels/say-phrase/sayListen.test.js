import { describe, it, expect } from 'vitest'
import { listenKeys } from './sayListen.js'

const lib = keys => new Map(keys.map(k => [k, { url: `https://x/${k}.mp3` }]))

describe('listenKeys — что играет «Послушать»', () => {
  it('вся фраза одной записью, если она есть в базе слов', () => {
    expect(listenKeys('I am here', lib(['i am here', 'i', 'am', 'here']))).toEqual(['i am here'])
  })

  it('иначе все слова по очереди (регистр и знаки препинания не важны)', () => {
    expect(listenKeys('I am here, please.', lib(['i', 'am', 'here', 'please']))).toEqual(['i', 'am', 'here', 'please'])
  })

  it('нет хотя бы одного слова — кнопка скрыта (дырявую фразу не играем)', () => {
    expect(listenKeys('I am here', lib(['i', 'here']))).toEqual([])
  })

  it('нет базы / пустая фраза / кириллица → пусто', () => {
    expect(listenKeys('I am here', null)).toEqual([])
    expect(listenKeys('', lib(['i']))).toEqual([])
    expect(listenKeys('Я здесь', lib(['я']))).toEqual([])
  })

  it('слишком длинная фраза по словам не играется (больше 12 слов)', () => {
    const phrase = Array.from({ length: 13 }, (_, i) => `w${i}`).join(' ')
    expect(listenKeys(phrase, lib(phrase.split(' ')))).toEqual([])
  })
})
