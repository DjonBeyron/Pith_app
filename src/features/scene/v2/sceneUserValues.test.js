import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { demoTemplateScene } from './demoScenes.js'
import { normalizeSceneV2 } from './sceneSchemaV2.js'
import { fillSceneVars } from './sceneVars.js'
import { pickUserValues, fillUserScene, sceneWordUrls, valueTexts, NO_VALUES } from './sceneUserFill.js'
import { resolveUserValues, peekUserValues, resetUserValues, startUserWait } from './sceneUserResolve.js'
import { ensureSceneWords, resetSceneWordsStore } from '../../../shared/lib/memory/sceneWordsStore.js'
import { setWordAudioSource } from '../../../shared/lib/wordAudio/wordAudioLookup.js'

// Слова пользователя в сценах (шаг 5): выбор по зерну, общий стор, ожидание, ошибки, прогрев озвучки слов (без React)
const withSeg = () => {
  const s = JSON.parse(JSON.stringify(demoTemplateScene))
  s.timeline[0].segments = [{ text: 'Can I have' }, { var: 'food' }, { text: ', please?' }]
  return normalizeSceneV2(s)
}
const WORDS = ['cheese', 'soup', 'bread', 'milk', 'apple', 'rice', 'tea', 'cake', 'fish', 'egg']
  .map(w => ({ key: w, text: w, translation: `${w}-ru`, level: 1, due: false, step: 1 }))
const ok = (words = WORDS) => ({ words, stats: {}, source: 'user', error: null })
const D1 = new Date(2026, 9, 16, 12).getTime()
const DAY = 86400000

beforeEach(() => { resetUserValues(); resetSceneWordsStore() })
afterEach(() => { vi.useRealTimers(); setWordAudioSource(null) })

describe('подстановка: чистые функции', () => {
  it('сцена без vars — та же ссылка (ноль накладных расходов)', () => {
    const plain = { version: 2, timeline: [{ who: 'a', text: 'Hi.' }] }
    expect(fillUserScene(plain, NO_VALUES)).toBe(plain)
    expect(pickUserValues(plain, WORDS, 'x', '2026-10-16')).toEqual({})
  })
  it('слово из памяти попадает в текст, перевод и сегмент; нет значений — запасное слово', () => {
    const scene = withSeg()
    const values = { food: { text: 'cheese', translation: 'сыр' } }
    const f = fillUserScene(scene, values)
    expect(f.vars).toBeUndefined()
    expect(f.timeline[0].text).toBe('Can I have cheese, please?')
    expect(f.timeline[0].translation).toBe('Можно мне сыр, пожалуйста?')
    expect(f.timeline[0].segments[1]).toMatchObject({ text: 'cheese', word: true })
    expect(fillUserScene(scene, null).timeline[0].text).toBe('Can I have a sandwich, please?')
  })
  it('зерно «день + id сцены»: в один день одно слово, на следующие дни меняется', () => {
    const scene = withSeg()
    const day = n => pickUserValues(scene, WORDS, 'scene-1', `2026-10-${10 + n}`).food.text
    expect(day(0)).toBe(day(0))
    expect(new Set([0, 1, 2, 3, 4, 5].map(day)).size).toBeGreaterThan(1)
    const other = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(k => pickUserValues(scene, WORDS, k, '2026-10-10').food.text))
    expect(other.size).toBeGreaterThan(1)
  })
  it('valueTexts / sceneWordUrls', () => {
    expect(valueTexts({ a: { text: 'tea' }, b: { text: '' } })).toEqual(['tea'])
    setWordAudioSource(k => (k === 'cheese' ? { url: 'https://r2/cheese.mp3', duration: 0.6 } : null))
    expect(sceneWordUrls(fillUserScene(withSeg(), { food: { text: 'cheese' } }))).toEqual(['https://r2/cheese.mp3'])
    expect(sceneWordUrls(fillUserScene(withSeg(), null))).toEqual([])
  })
})

describe('общий стор слов', () => {
  it('несколько сцен одновременно и подряд — ОДНА загрузка слов', async () => {
    const load = vi.fn(async () => ok())
    await Promise.all([ensureSceneWords({ load }), ensureSceneWords({ load }), ensureSceneWords({ load })])
    await ensureSceneWords({ load })
    expect(load).toHaveBeenCalledTimes(1)
  })
  it('ошибка сети в стор не кладётся — следующая просьба пробует снова', async () => {
    const load = vi.fn().mockResolvedValueOnce({ words: [], error: 'сеть' }).mockResolvedValueOnce(ok())
    expect((await ensureSceneWords({ load })).error).toBe('сеть')
    expect((await ensureSceneWords({ load })).error).toBeNull()
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('resolveUserValues', () => {
  it('три сцены (слайда) — слова грузятся один раз, у каждой своё решение', async () => {
    const loader = vi.fn(async () => ok())
    const load = () => ensureSceneWords({ load: loader })
    const ensureAudio = vi.fn().mockResolvedValue(false)
    const scene = withSeg()
    const rs = await Promise.all(['a', 'b', 'c'].map(key => resolveUserValues(scene, { key, now: D1, load, ensureAudio, prefetch: () => {} })))
    expect(loader).toHaveBeenCalledTimes(1)
    expect(rs.every(r => r.cached && r.values.food.text)).toBe(true)
  })
  it('одна сцена на трёх слайдах: общий промис, один прогрев озвучки слова', async () => {
    const load = vi.fn(async () => ok())
    const ensureAudio = vi.fn().mockResolvedValue(true)
    const scene = withSeg()
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => resolveUserValues(scene, { key: 's', now: D1, load, ensureAudio, prefetch: () => {} })))
    expect(load).toHaveBeenCalledTimes(1)
    expect(ensureAudio).toHaveBeenCalledTimes(1)
    expect(ensureAudio.mock.calls[0][0]).toEqual([a.values.food.text])
    expect(b.values).toBe(a.values)
    expect(c.values).toBe(a.values)
  })
  it('повторное открытие — то же слово, даже если память изменилась; после старта значения не меняются', async () => {
    const scene = withSeg()
    const opts = { key: 's', now: D1, ensureAudio: vi.fn().mockResolvedValue(false), prefetch: () => {} }
    const first = await resolveUserValues(scene, { ...opts, load: async () => ok() })
    const again = await resolveUserValues(scene, { ...opts, load: async () => ok([{ ...WORDS[0], text: 'zzz', key: 'zzz' }]) })
    expect(again.values).toBe(first.values)
    expect(peekUserValues(scene, 's', D1)).toBe(first.values)
  })
  it('новый день — новое зерно, решение прошлого дня не используется', async () => {
    const scene = withSeg()
    const opts = { key: 's', ensureAudio: vi.fn().mockResolvedValue(false), prefetch: () => {}, load: async () => ok() }
    await resolveUserValues(scene, { ...opts, now: D1 })
    expect(peekUserValues(scene, 's', D1 + DAY)).toBeNull()
  })
  it('ошибка сети или исключение — запасное слово (cached=false), решение не запоминается', async () => {
    const scene = withSeg()
    const base = { key: 's', now: D1, ensureAudio: vi.fn(), prefetch: () => {} }
    expect((await resolveUserValues(scene, { ...base, load: async () => ({ words: [], error: 'сеть' }) })).cached).toBe(false)
    expect((await resolveUserValues(scene, { ...base, load: async () => { throw new Error('boom') } })).cached).toBe(false)
    expect(peekUserValues(scene, 's', D1)).toBeNull()
  })
  it('пустая память — значения пусты (запасное), без прогрева озвучки; решение запоминается', async () => {
    const ensureAudio = vi.fn()
    const r = await resolveUserValues(withSeg(), { key: 's', now: D1, load: async () => ok([]), ensureAudio, prefetch: () => {} })
    expect(r).toEqual({ values: {}, cached: true })
    expect(ensureAudio).not.toHaveBeenCalled()
  })
  it('гость: слова локальной памяти подставляются так же', async () => {
    const r = await resolveUserValues(withSeg(), { key: 'g', now: D1, load: async () => ({ ...ok(WORDS.slice(0, 1)), source: 'guest' }), ensureAudio: vi.fn().mockResolvedValue(false), prefetch: () => {} })
    expect(r.values.food.text).toBe('cheese')
  })
  it('прогрев: озвучка слов запрашивается по выбранным словам, потом URL слова уходит в подкачку', async () => {
    const prefetch = vi.fn()
    const ensureAudio = vi.fn(async () => { setWordAudioSource(k => ({ url: `https://r2/${k}.mp3`, duration: 0.5 })); return true })
    const r = await resolveUserValues(withSeg(), { key: 's', now: D1, load: async () => ok(WORDS.slice(0, 1)), ensureAudio, prefetch })
    expect(ensureAudio).toHaveBeenCalledWith(['cheese'])
    expect(prefetch).toHaveBeenCalledWith(['https://r2/cheese.mp3'])
    expect(sceneWordUrls(fillUserScene(withSeg(), r.values))).toEqual(['https://r2/cheese.mp3'])
  })
  it('озвучка слов не отвечает — ждём не дольше остатка бюджета, слово из памяти всё равно подставляется', async () => {
    vi.useFakeTimers()
    const p = resolveUserValues(withSeg(), { key: 's', now: D1, budgetMs: 500, audioWaitMs: 250, load: async () => ok(), ensureAudio: () => new Promise(() => {}), prefetch: () => {} })
    await vi.advanceTimersByTimeAsync(260)
    const r = await p
    expect(r.cached).toBe(true)
    expect(r.values.food.text).toBeTruthy()
  })
})

describe('startUserWait — ожидание значений экземпляра сцены', () => {
  const hooks = () => ({ onReady: vi.fn(), onLost: vi.fn() })
  it('значения готовы вовремя → onReady, таймер не срабатывает', async () => {
    vi.useFakeTimers()
    const h = hooks()
    startUserWait(withSeg(), { waitMs: 500, resolve: async () => ({ values: {}, cached: true }), ...h })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(600)
    expect(h.onReady).toHaveBeenCalledTimes(1)
    expect(h.onLost).not.toHaveBeenCalled()
  })
  it('таймаут → onLost (запасное слово); поздний ответ ничего не меняет', async () => {
    vi.useFakeTimers()
    const h = hooks()
    let done
    startUserWait(withSeg(), { waitMs: 500, resolve: () => new Promise(r => { done = r }), ...h })
    await vi.advanceTimersByTimeAsync(500)
    expect(h.onLost).toHaveBeenCalledTimes(1)
    done({ values: {}, cached: true })
    await vi.advanceTimersByTimeAsync(10)
    expect(h.onReady).not.toHaveBeenCalled()
    expect(h.onLost).toHaveBeenCalledTimes(1)
  })
  it('ошибка слов (cached=false) или отказ промиса → сразу onLost, без ожидания таймера', async () => {
    const a = hooks(); const b = hooks()
    startUserWait(withSeg(), { resolve: async () => ({ values: {}, cached: false }), ...a })
    startUserWait(withSeg(), { resolve: () => Promise.reject(new Error('x')), ...b })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(a.onLost).toHaveBeenCalledTimes(1)
    expect(b.onLost).toHaveBeenCalledTimes(1)
  })
  it('cancel() гасит оба колбэка (слайд ушёл из окна / нода размонтирована)', async () => {
    vi.useFakeTimers()
    const h = hooks()
    const cancel = startUserWait(withSeg(), { waitMs: 500, resolve: () => new Promise(() => {}), ...h })
    cancel()
    await vi.advanceTimersByTimeAsync(1000)
    expect(h.onLost).not.toHaveBeenCalled()
    expect(h.onReady).not.toHaveBeenCalled()
  })
})

describe('fillSceneVars и запасное слово остаются как раньше', () => {
  it('fillSceneVars(scene) без значений — запасное слово', () => {
    expect(fillSceneVars(withSeg()).timeline[0].text).toBe('Can I have a sandwich, please?')
  })
})
