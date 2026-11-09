import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RaceAskScene } from '../pitrace/RaceAskPlate.jsx'
import { latinRu } from '../pitrace/racePhraseLatin.js'
import { scorePhrases } from '../pitrace/racePhraseScore.js'
import { readStandPrefs, writeStandPrefs, PREFS_KEY } from './pillStandPrefs.js'

const start = { options: [{ sid: 'catch-ann', label: 'Пинг-понг B' }], value: '', onChange: () => {} }
const scene = props => renderToStaticMarkup(createElement(RaceAskScene, { choice: 'voice', onPick: () => {}, onCancel: () => {}, ...props }))

// Вход в стенд пилюль — только при отладке (там же, где «Начать с»); русские фразы стенда сравниваются слушателем фраз (латиница); настройки стенда помнятся
describe('стенд пилюль: вход с плашки «Голосом / Пальцами»', () => {
  it('отладка (есть «Начать с») — кнопка «🧪 Стенд пилюль»', () => {
    const html = scene({ start, onStand: () => {} })
    expect(html).toContain('data-testid="race-ask-stand"')
    expect(html).toContain('🧪 Стенд пилюль')
  })
  it('обычный пользователь (start = null) — кнопки нет', () => {
    expect(scene({ start: null, onStand: () => {} })).not.toContain('race-ask-stand')
    expect(scene({ start: null })).not.toContain('Стенд пилюль')
  })
  it('пока ждём микрофон — кнопка неактивна', () => {
    expect(scene({ start, onStand: () => {}, wait: 'mic' })).toMatch(/<button type="button" class="raceAskStand" disabled=""/)
  })
})

describe('стенд пилюль: русские фразы в слушателе фраз', () => {
  it('кириллица → латиница, английский текст не меняется', () => {
    expect(latinRu('Приятно познакомиться, ёж!')).toBe('priyatno poznakomitsya, ezh!')
    expect(latinRu("I'm trying")).toBe("I'm trying")
  })
  it('русская фраза засчитывается по словам и по порядку (проход 1), с допуском на окончание', () => {
    const ph = [{ key: 'r', words: ['Я', 'пытаюсь', 'учиться'] }]
    expect(scorePhrases(ph, 'я пытаюсь учиться', true)[0].ratio).toBe(1)
    expect(scorePhrases(ph, 'я пытаюсь', true)[0].hits).toEqual([true, true, false])
    expect(scorePhrases(ph, 'учиться я', true)[0].hits.filter(Boolean)).toHaveLength(1)
    expect(scorePhrases([{ key: 'p', words: ['Приятно', 'познакомиться'] }], 'приятно познакомится')[0].ratio).toBe(1)
  })
})

describe('стенд пилюль: настройки', () => {
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m } }
  it('по умолчанию EN, слово, любые, авто 1,2 с; сохранённое читается, мусор — по умолчанию', () => {
    const s = mem()
    expect(readStandPrefs(s)).toEqual({ lang: 'en', mode: 'word', len: 'any', auto: true, autoMs: 1200 })
    writeStandPrefs({ lang: 'ru', mode: 'fast', len: 'long', auto: false, autoMs: 2000 }, s)
    expect(readStandPrefs(s)).toEqual({ lang: 'ru', mode: 'fast', len: 'long', auto: false, autoMs: 2000 })
    s.setItem(PREFS_KEY, '{"lang":"de","mode":1')
    expect(readStandPrefs(s).lang).toBe('en')
  })
})
