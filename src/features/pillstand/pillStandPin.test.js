import { describe, it, expect } from 'vitest'
import { pickTarget, pinned } from './pillStandPick.js'
import { PRESETS, readStandPrefs, DEFAULTS } from './pillStandPrefs.js'
import { maskText } from './pillStandFrames.js'

// Пресеты стенда (v3.3.303): повторить случай из журнала «Where are you from» без «are» — фраза закреплена, каждая цель одна и та же.
describe('закреплённая фраза и пресеты стенда', () => {
  it('pin даёт ту же фразу при любом сиде и номере цели; в режиме «Слово» pin не действует; нет такой фразы — цель по сиду', () => {
    for (const seed of ['a', 'b', 'mwoewh68-1']) for (const n of [0, 1, 7]) expect(pickTarget({ seed, n, mode: 'words', lang: 'en', pin: 'where are you from' }).say).toBe('Where are you from')
    expect(pinned('word', 'en', 'Where are you from')).toBeNull()
    expect(pickTarget({ seed: 'a', n: 0, mode: 'words', lang: 'en', pin: 'нет такой' }).say).toBeTruthy()
    expect(pickTarget({ seed: 'a', n: 0, mode: 'fast', lang: 'ru', pin: 'Where are you from' }).say).toBe('Откуда ты') // по-русски говорят перевод, закрепление — по английскому тексту
  })
  it('пресеты «are пропущено»: режим по словам / быстро, EN, закреплённая фраза, авто выключено; настройки их читают', () => {
    expect(PRESETS.map(p => p.set.mode)).toEqual(['words', 'fast']); for (const p of PRESETS) expect(p.set).toMatchObject({ lang: 'en', pin: 'Where are you from', auto: false })
    const store = { v: null, getItem() { return this.v }, setItem(k, v) { this.v = v } }; store.v = JSON.stringify({ ...DEFAULTS, ...PRESETS[0].set })
    expect(readStandPrefs(store)).toMatchObject(PRESETS[0].set)
  })
  it('таблица кадров: пропущенное красным слово — !are!', () => {
    expect(maskText([{ t: 'Where', w: 'full' }, { t: 'are', w: 'miss' }, { t: 'you', w: 'draft' }, { t: '▭▭▭▭', w: 'hidden' }])).toBe('Where !are! you* ░')
  })
})
