import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildSceneWords, translationMap, loadSceneWords, clearSceneWordsCache, WORDS_TTL_MS } from './sceneVarsSource.js'

const TODAY = '2026-10-16'
const row = (word, step, extra = {}) => ({ word, step, due_on: '2026-10-20', settled_on: null, ...extra })
const mod = (id, tr, published = true) => ({ id, published, word_translations: tr.map(([w, t]) => ({ w, t })) })
const MODS = [mod('m1', [['Cheese', 'сыр'], ['soup', 'суп'], ['tea', 'чай'], ['bread', 'хлеб'], ['juice', 'сок'], ['ice cream', 'мороженое']])]

describe('translationMap', () => {
  it('ключ — wordKey (регистр и пунктуация нормализуются); черновики не берём', () => {
    const m = translationMap([mod('a', [['Cheese.', 'сыр']]), mod('b', [['milk', 'молоко']], false)])
    expect(m.get('cheese')).toBe('сыр')
    expect(m.has('milk')).toBe(false)
  })
  it('несколько модулей — перевод из модуля с наименьшим id, порядок загрузки не важен', () => {
    const a = mod('m1', [['tea', 'чай']])
    const b = mod('m2', [['tea', 'чаёк']])
    expect(translationMap([b, a]).get('tea')).toBe('чай')
    expect(translationMap([a, b]).get('tea')).toBe('чай')
  })
  it('пустой перевод пропускается, берётся следующий модуль', () => {
    expect(translationMap([mod('a', [['tea', ' ']]), mod('b', [['tea', 'чай']])]).get('tea')).toBe('чай')
  })
})

describe('buildSceneWords', () => {
  it('уровни по шагам и постоянной памяти; нижний регистр; due по локальной дате', () => {
    const { words, stats } = buildSceneWords([
      row('cheese', 1, { due_on: '2026-10-16' }), row('soup', 3, { due_on: '2026-10-10' }),
      row('tea', 5), row('bread', 5, { settled_on: '2026-09-01' }),
    ], MODS, TODAY)
    const by = Object.fromEntries(words.map(w => [w.key, w]))
    expect(by.cheese).toEqual({ key: 'cheese', text: 'cheese', translation: 'сыр', level: 1, due: true, step: 1 })
    expect(by.soup).toMatchObject({ level: 2, due: true })
    expect(by.tea).toMatchObject({ level: 3, due: false })
    expect(by.bread).toMatchObject({ level: 4, due: false })
    expect(stats).toMatchObject({ total: 4, usable: 4, due: 2, byLevel: { 1: 1, 2: 1, 3: 1, 4: 1 } })
  })
  it('фильтры: нет перевода, фраза, цифры, длинное слово, повтор', () => {
    const long = 'a'.repeat(25)
    const { words, stats } = buildSceneWords([
      row('cheese', 1), row('cheese', 2), row('ice cream', 1), row('mp3', 1), row(long, 1), row('unknownword', 2), row("don't", 1),
    ], [...MODS, mod('m2', [[long, 'длинное'], ["don't", 'не делай']])], TODAY)
    expect(words.map(w => w.key)).toEqual(['cheese', "don't"])
    expect(stats.noTranslation).toBe(1) // unknownword
    expect(stats.notSimple).toBe(3) // ice cream, mp3 (нет перевода-ключа не нужен), long
    expect(stats.total).toBe(6)
  })
  it('перевод длиннее 40 символов не используется; мусор на входе не падает', () => {
    expect(buildSceneWords([row('tea', 1)], [mod('m', [['tea', 'ч'.repeat(41)]])], TODAY).words).toEqual([])
    expect(buildSceneWords(null, null, TODAY).words).toEqual([])
    expect(buildSceneWords([null, {}, row(null, 1)], MODS, TODAY).stats.total).toBe(0)
  })
})

describe('loadSceneWords', () => {
  beforeEach(() => clearSceneWordsCache())
  const mk = () => ({ listMemory: vi.fn(async () => [row('cheese', 1)]), loadModules: vi.fn(async () => MODS), session: async () => ({ user: { id: 'u1' } }) })

  it('залогиненный: слова, источник user, ошибки нет', async () => {
    const r = await loadSceneWords({ ...mk(), now: Date.parse('2026-10-16T12:00:00') })
    expect(r.error).toBeNull()
    expect(r.source).toBe('user')
    expect(r.words[0]).toMatchObject({ text: 'cheese', translation: 'сыр', level: 1 })
  })
  it('гость: источник guest, кэш отдельный от пользователя', async () => {
    const guest = { ...mk(), session: async () => null }
    expect((await loadSceneWords(guest)).source).toBe('guest')
    const user = mk()
    await loadSceneWords(user)
    expect(user.listMemory).toHaveBeenCalledTimes(1)
  })
  it('кэш: второй вызов без сети; TTL истёк — снова; force — снова; clear — снова', async () => {
    const c = mk()
    const t0 = 1_000_000
    await loadSceneWords({ ...c, now: t0 })
    await loadSceneWords({ ...c, now: t0 + WORDS_TTL_MS - 1 })
    expect(c.listMemory).toHaveBeenCalledTimes(1)
    await loadSceneWords({ ...c, now: t0 + WORDS_TTL_MS })
    expect(c.listMemory).toHaveBeenCalledTimes(2)
    await loadSceneWords({ ...c, now: t0 + WORDS_TTL_MS, force: true })
    expect(c.listMemory).toHaveBeenCalledTimes(3)
    clearSceneWordsCache()
    await loadSceneWords({ ...c, now: t0 + WORDS_TTL_MS })
    expect(c.listMemory).toHaveBeenCalledTimes(4)
  })
  it('другой пользователь — другой кэш', async () => {
    const c = mk()
    await loadSceneWords(c)
    await loadSceneWords({ ...c, session: async () => ({ user: { id: 'u2' } }) })
    expect(c.listMemory).toHaveBeenCalledTimes(2)
  })
  it('ошибка сети: { words: [], error } без падения и без кэширования', async () => {
    const c = { ...mk(), loadModules: vi.fn(async () => { throw new Error('network down') }) }
    const r = await loadSceneWords(c)
    expect(r).toMatchObject({ words: [], error: 'network down' })
    expect(r.stats.usable).toBe(0)
    c.loadModules.mockResolvedValueOnce(MODS)
    expect((await loadSceneWords(c)).error).toBeNull()
  })
  it('пустая память — не ошибка', async () => {
    const r = await loadSceneWords({ ...mk(), listMemory: async () => [] })
    expect(r).toMatchObject({ words: [], error: null })
  })
})
