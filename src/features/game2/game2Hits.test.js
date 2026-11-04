import { describe, it, expect } from 'vitest'
import { inWindow, creditWord, expiredPills, isStuck, isLagging, winTail, SHADOW_WIN, CATCH_WINDOW_MS, SHADOW_WINDOW_MS, HEARD_LAG_MS, STUCK_MS } from './game2Hits.js'

const pills = [
  { i: 1, text: 'trying', startMs: 2000, endMs: 2500 },
  { i: 3, text: 'learn', startMs: 3500, endMs: 4000 },
  { i: 4, text: 'learn', startMs: 6000, endMs: 6400 },
]

const shadow = [
  { i: 0, text: "i'm", startMs: 0, endMs: 250 }, { i: 1, text: 'trying', startMs: 300, endMs: 700 },
  { i: 2, text: 'to', startMs: 800, endMs: 950 }, { i: 3, text: 'learn', startMs: 1000, endMs: 1500 },
]

describe('окно «Тени»: от слова Пита до +1,0 с', () => {
  it('окно [0; +1000] от начала слова Пита: раньше голоса Пита не засчитывается, позже +1 с — тоже', () => {
    expect(SHADOW_WIN).toEqual({ from: 0, to: 1000 }); expect(winTail(SHADOW_WIN)).toBe(1000); expect(winTail(800)).toBe(800)
    const p = shadow[1] // trying: 300…700
    expect(inWindow(p, 299, SHADOW_WIN)).toBe(false); expect(inWindow(p, 300, SHADOW_WIN)).toBe(true)
    expect(inWindow(p, 1300, SHADOW_WIN)).toBe(true); expect(inWindow(p, 1301, SHADOW_WIN)).toBe(false)
  })
  it('пример из «Как играть»: «trying» на «to» Пита (0,8 с) засчитывается, «trying» до голоса Пита (0,1 с) — нет; «learn» в тишине (1,6 с) — своей пилюле', () => {
    expect(creditWord(shadow, new Set(), 'trying', 800, SHADOW_WIN)).toBe(1)
    expect(creditWord(shadow, new Set(), 'trying', 100, SHADOW_WIN)).toBe(-1)
    expect(creditWord(shadow, new Set([0, 1, 2]), 'learn', 1600, SHADOW_WIN)).toBe(3)
  })
  it('«прошло окно»: пилюля не поймана через 1 с после начала её слова (а не слова + 1 с)', () => {
    expect(expiredPills(shadow, new Set(), new Set(), 1300, SHADOW_WIN).map(p => p.i)).toEqual([0])
    expect(expiredPills(shadow, new Set(), new Set(), 1301, SHADOW_WIN).map(p => p.i)).toEqual([0, 1])
  })
})

describe('отстал: больше чем на слово', () => {
  it('последнее засчитанное слово позади текущего слова Пита на 2 и больше; полслова позади — норма', () => {
    expect(isLagging({ pills: shadow, filled: new Set([0]), t: 1000 })).toBe(false) // текущее — «trying» (на «to» ещё нет 0,4 с): позади на 1
    expect(isLagging({ pills: shadow, filled: new Set([0, 1]), t: 1300 })).toBe(false) // текущее — «to», засчитано «trying»: позади на 1
    expect(isLagging({ pills: shadow, filled: new Set([0]), t: 1300 })).toBe(true) // текущее — «to» (прошло 0,5 с), засчитано только «I'm»: позади на 2
    expect(isLagging({ pills: shadow, filled: new Set(), t: 750 })).toBe(true) // ничего не сказал, Пит уже на «trying» (прошло 0,45 с): позади на 2
  })
  it('слово Пита, которое только началось (меньше 0,4 с), «текущим» не считается; до голоса Пита и без пилюль — не отстал', () => {
    expect(isLagging({ pills: shadow, filled: new Set(), t: 100 })).toBe(false)
    expect(isLagging({ pills: shadow, filled: new Set(), t: 650 })).toBe(false) // «trying» начался 350 мс назад
    expect(isLagging({ pills: [], filled: new Set(), t: 5000 })).toBe(false)
  })
})

describe('окна попадания', () => {
  it('константы из задания: «Ловлю» ±0,8 с, «Тень» ±1 с, поправка на Vosk 200 мс, застрял — 3 с', () => {
    expect([CATCH_WINDOW_MS, SHADOW_WINDOW_MS, HEARD_LAG_MS, STUCK_MS]).toEqual([800, 1000, 200, 3000]) // «Тень» — не ±1 с, а [0; +1 с] от слова Пита (SHADOW_WIN)
  })
  it('окно — вокруг интервала слова', () => {
    expect(inWindow(pills[0], 1200, 800)).toBe(true)
    expect(inWindow(pills[0], 1199, 800)).toBe(false)
    expect(inWindow(pills[0], 3300, 800)).toBe(true)
    expect(inWindow(pills[0], 3301, 800)).toBe(false)
  })
  it('слово приписывается своей пилюле, если момент в окне; чужое слово и не своё время не засчитываются', () => {
    const f = new Set()
    expect(creditWord(pills, f, 'trying', 2300, 800)).toBe(1)
    expect(creditWord(pills, f, 'Learn', 3400, 800)).toBe(3)
    expect(creditWord(pills, f, 'learn', 1000, 800)).toBe(-1) // слишком рано для обеих
    expect(creditWord(pills, f, 'banana', 2300, 800)).toBe(-1)
  })
  it('одно слово дважды: сначала ранней пилюле, потом следующей; залитая второй раз не засчитывается', () => {
    const f = new Set([3])
    expect(creditWord(pills, f, 'learn', 3600, 800)).toBe(-1) // ранняя залита, вторая ещё далеко
    expect(creditWord(pills, f, 'learn', 5500, 800)).toBe(4)
  })
  it('«прошло окно» — пилюля не поймана; отмеченные и залитые не повторяются', () => {
    expect(expiredPills(pills, new Set(), new Set(), 3300, 800)).toEqual([]) // 2500 + 800 = 3300 — ещё в окне
    expect(expiredPills(pills, new Set(), new Set(), 3301, 800).map(p => p.i)).toEqual([1])
    expect(expiredPills(pills, new Set([1]), new Set(), 3301, 800)).toEqual([])
    expect(expiredPills(pills, new Set(), new Set([1]), 3301, 800)).toEqual([])
  })
  it('застрял: нет ни одного слова за 3 с от первого слова, подсказка один раз', () => {
    expect(isStuck({ t: 4999, firstStartMs: 2000 })).toBe(false)
    expect(isStuck({ t: 5000, firstStartMs: 2000 })).toBe(true)
    expect(isStuck({ t: 9000, firstStartMs: 2000, credited: 1 })).toBe(false)
    expect(isStuck({ t: 9000, firstStartMs: 2000, hinted: true })).toBe(false)
  })
})
