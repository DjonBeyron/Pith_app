import { describe, it, expect } from 'vitest'
import { pickConfusers, sameStem, similarity, MIN_SIMILARITY } from './pickConfusers.js'

const zero = () => 0

describe('pickConfusers: похожие слова', () => {
  it('sheep → ship и chip из колоды', () => {
    const pool = ['sheep', 'ship', 'chip', 'table', 'run', 'the']
    expect(pickConfusers('sheep', pool, { rand: zero }).sort()).toEqual(['chip', 'ship'])
  })

  it('самое похожее — первым; верное слово и повторы не попадают', () => {
    const got = pickConfusers('keep', ['keep', 'Keep', 'kelp', 'deep', 'deep', 'zebra'], { rand: zero })
    expect(got).toHaveLength(2)
    expect(got).not.toContain('keep')
    expect(new Set(got).size).toBe(2)
    expect(got).toEqual(expect.arrayContaining(['deep', 'kelp']))
  })

  it('формы того же слова (try / tried / tries) двойниками не берутся', () => {
    expect(sameStem('try', 'tried')).toBe(true)
    expect(sameStem('keep', 'keeps')).toBe(true)
    expect(sameStem('go', 'going')).toBe(true)
    expect(sameStem('ship', 'shop')).toBe(false)
    const got = pickConfusers('try', ['tried', 'tries', 'trying', 'dry', 'cry', 'tray'], { rand: zero })
    expect(got.every(w => !['tried', 'tries', 'trying'].includes(w))).toBe(true)
    expect(got).toHaveLength(2)
  })

  it('совсем непохожие не берутся: пара не набралась — меньше двух', () => {
    expect(similarity('keep', 'zebra')).toBeLessThan(MIN_SIMILARITY)
    expect(pickConfusers('keep', ['zebra', 'table', 'orange'], { rand: zero })).toEqual([])
    expect(pickConfusers('keep', ['deep', 'zebra'], { rand: zero })).toEqual(['deep'])
  })

  it('мусор в пуле (кириллица, цифры, фразы, пусто) пропускается', () => {
    expect(pickConfusers('ship', ['шип', 'sh1p', 'two words', '', null, undefined, 'shop', 'chip'], { rand: zero }).sort()).toEqual(['chip', 'shop'])
    expect(pickConfusers('ship', null)).toEqual([])
  })

  it('count ограничивает число двойников; при равенстве решает rand, но не выходит за порог', () => {
    const pool = ['shop', 'chip', 'shin', 'whip']
    expect(pickConfusers('ship', pool, { count: 1, rand: zero })).toHaveLength(1)
    expect(pickConfusers('ship', pool, { count: 3, rand: zero })).toHaveLength(3)
  })
})
