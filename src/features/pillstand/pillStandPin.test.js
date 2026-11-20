import { describe, it, expect } from 'vitest'
import { pickTarget, pinned, mixList } from './pillStandPick.js'
import { STAND_MIX, STAND_PHRASES } from './pillStandData.js'
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
    const are = PRESETS.filter(p => p.id.startsWith('skip-are')); expect(are.map(p => p.set.mode)).toEqual(['words', 'fast']); for (const p of are) expect(p.set).toMatchObject({ lang: 'en', pin: 'Where are you from', auto: false })
    const store = { v: null, getItem() { return this.v }, setItem(k, v) { this.v = v } }; store.v = JSON.stringify({ ...DEFAULTS, ...PRESETS[0].set })
    expect(readStandPrefs(store)).toMatchObject(PRESETS[0].set)
  })
  it('таблица кадров: пропущенное красным слово — !are!', () => {
    expect(maskText([{ t: 'Where', w: 'full' }, { t: 'are', w: 'miss' }, { t: 'you', w: 'draft' }, { t: '▭▭▭▭', w: 'hidden' }])).toBe('Where !are! you* ░')
  })
})

describe('подборка по порядку (v3.3.312)', () => {
  it('каждая фраза подборки есть в стенде; цель n — n-я по кругу; для слов — все слова по порядку; русский язык — переводы', () => {
    const en = STAND_PHRASES.map(p => p.en.toLowerCase()); for (const f of STAND_MIX) expect(en).toContain(f.toLowerCase())
    expect(mixList('words', 'en').map(c => c.say)).toEqual(STAND_MIX)
    for (const n of [0, 1, 5, STAND_MIX.length, STAND_MIX.length + 2]) expect(pickTarget({ seed: 'x', n, mode: 'words', lang: 'en', mix: true }).say).toBe(STAND_MIX[n % STAND_MIX.length])
    expect(pickTarget({ seed: 'x', n: 3, mode: 'fast', lang: 'ru', mix: true }).say).toBe(STAND_PHRASES.find(p => p.en === STAND_MIX[3]).ru)
    expect(pickTarget({ seed: 'x', n: 2, mode: 'words', lang: 'en', mix: true, pin: 'Good morning' }).say).toBe('Good morning') // закрепление главнее подборки
    expect(mixList('word', 'en').length).toBeGreaterThan(30)
    expect(PRESETS.filter(p => p.set.mix).map(p => p.set.mode)).toEqual(['words', 'fast', 'word'])
  })
})

describe('«что выбрано» у пресетов и запись до «Старт» (v3.3.313)', () => {
  it('presetOn: пресет выбран, когда все его настройки совпали; у каждого пресета есть вид (mix — подборка, pin — случай)', async () => {
    const { presetOn } = await import('./pillStandPrefs.js'), { DEFAULTS } = await import('./pillStandPrefs.js')
    const mixW = PRESETS.find(p => p.id === 'mix-words'), pinW = PRESETS.find(p => p.id === 'skip-are-words')
    expect(presetOn(mixW, { ...DEFAULTS, ...mixW.set })).toBe(true); expect(presetOn(mixW, { ...DEFAULTS, ...pinW.set })).toBe(false); expect(presetOn(mixW, DEFAULTS)).toBe(false)
    expect(PRESETS.filter(p => p.kind === 'mix')).toHaveLength(3); expect(PRESETS.filter(p => p.kind === 'pin')).toHaveLength(2)
  })
  it('цель подборки несёт номер в подборке (mix / mixOf) — виден в трассе', () => {
    const t = pickTarget({ seed: 'x', n: 4, mode: 'words', lang: 'en', mix: true }); expect(t.mix).toBe(4); expect(t.mixOf).toBe(STAND_MIX.length)
    expect(pickTarget({ seed: 'x', n: 4, mode: 'words', lang: 'en' }).mix).toBeUndefined()
  })
  it('проводка: запись «до Старт» — armed в PillStand, кнопка в панели, стили выбранного и отклика', async () => {
    const fs = await import('node:fs'), rd = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8')
    expect(rd('./PillStand.jsx')).toContain("trace.push('rec-arm'"); expect(rd('./PillStand.jsx')).toContain('r.start()')
    expect(rd('./PillStandBar.jsx')).toContain('Запись до «Старт»'); expect(rd('./PillStandBar.jsx')).toContain('presetOn(p, prefs)')
    const css = rd('../../styles/pillstand/pill-stand-pick.css'); expect(css).toContain(".psPreset[data-kind='mix']"); expect(css).toContain(':active'); expect(css).toContain('@keyframes psPop')
  })
})
