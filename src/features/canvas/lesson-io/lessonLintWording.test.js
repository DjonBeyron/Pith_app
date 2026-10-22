import { describe, it, expect } from 'vitest'
import { checkWordingRules } from './lessonLintWording.js'
import { applyMarkup } from '../../../shared/lib/lessonMarkup.js'

const T = (ref, content, triggers = []) => ({ ref, type: 'text', data: applyMarkup({ content }), triggers })
const W = (ref, to) => ({ ref, type: 'word_choice', data: { options: [] }, triggers: [{ if: 'wrong', then: to }, { if: 'correct', then: 'z' }] })

describe('lessonLintWording', () => {
  it('R-quotes: кавычки не у перевода — замечание, у {t:«..»} — нет', () => {
    expect(checkWordingRules([T('a', 'нужно слово «я»')]).join()).toMatch(/R-quotes/)
    expect(checkWordingRules([T('a', 'нужно слово {w:я}')])).toEqual([])
    expect(checkWordingRules([T('a', '{g:I\'m} это {t:«я есть»}')])).toEqual([])
  })
  it('R-tense: время без подчёркивания — замечание', () => {
    expect(checkWordingRules([T('a', 'это настоящее время')]).join()).toMatch(/R-tense/)
    expect(checkWordingRules([T('a', 'это {u:настоящее время}')])).toEqual([])
  })
  it('R-retry: «ещё раз» в ветке ошибки', () => {
    const nodes = [W('q', 'h'), T('h', 'не совсем) ещё раз?'), T('z', 'ок')]
    expect(checkWordingRules(nodes).join()).toMatch(/R-retry/)
    expect(checkWordingRules([W('q', 'h'), T('h', 'не совсем) нужно сказать I\'m'), T('z', 'ок')])).toEqual([])
  })
  it('R-wording: «почти» в большинстве подсказок', () => {
    const mk = (open) => [...[1, 2, 3, 4, 5].map(i => W('q' + i, 'h' + i)), ...[1, 2, 3, 4, 5].map(i => T('h' + i, open(i) + ') ок')), T('z', 'ок')]
    expect(checkWordingRules(mk(() => 'почти')).join()).toMatch(/R-wording/)
    expect(checkWordingRules(mk(i => (i < 2 ? 'почти' : 'не совсем')))).toEqual([])
  })
  it('R-audio-markup: английское слово в голосовом без выделения', () => {
    const A = (c) => ({ ref: 'a', type: 'audio', data: applyMarkup({ text: c }), triggers: [] })
    expect(checkWordingRules([A('На русский to часто не переводят'), T('z', '{g:go}')]).join()).toMatch(/R-audio-markup/)
    expect(checkWordingRules([A('На русский {g:to} часто не переводят')])).toEqual([])
  })
  it('R-table-big: таблица-показ больше 5 ячеек', () => {
    const cells = n => Array.from({ length: n }, (_, i) => ({ id: 'c' + i, row: 1, col: i, value: 'x' }))
    const tb = (mode, n) => ({ ref: 't', type: 'table', data: { mode, table: { cells: cells(n) } }, triggers: [] })
    expect(checkWordingRules([tb('demo', 6)]).join()).toMatch(/R-table-big/)
    expect(checkWordingRules([tb('demo', 5)])).toEqual([])
    expect(checkWordingRules([tb('dictator', 12)])).toEqual([])
  })
  it('R-audio-markup: и в текстовых репликах английское должно быть выделено', () => {
    expect(checkWordingRules([T('a', 'вот пример, где to показывает направление'), T('z', '{g:go}')]).join()).toMatch(/R-audio-markup/)
    expect(checkWordingRules([T('a', 'вот пример, где {g:to} показывает направление')])).toEqual([])
  })
  it('R-slang: «ваще» и подобное запрещены', () => {
    expect(checkWordingRules([T('a', 'скажи ваще что угодно')]).join()).toMatch(/R-slang/)
    expect(checkWordingRules([T('a', 'скажи вообще что угодно')])).toEqual([])
  })

it('R-audio-markup: зачёркнутое красным {x:in} в подсказке — выделение, замечания нет; голое in — есть', () => {
  const bold = T('b', 'смотри {g:at}')
  expect(checkWordingRules([bold, T('a', 'без in и без to')]).filter(w => /R-audio-markup/.test(w)).length).toBe(1)
  expect(checkWordingRules([bold, T('c', 'без {x:in}')]).filter(w => /R-audio-markup/.test(w))).toEqual([])
})
})
