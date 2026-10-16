import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../api/supabase.js', () => ({ supabase: {} }))
vi.mock('./wordAudioApi.js', () => {
  let cache = null
  return { cachedWordAudio: () => cache, subscribeWordAudio: () => () => {}, __setCache: m => { cache = m } }
})
const api = await import('./wordAudioApi.js')
const { ensureWordAudio, wordAudioRow, resetWordAudioEnsure, MISS_TTL_MS } = await import('./wordAudioEnsure.js')
const { lookupWordAudio, toLookup, hasWordAudioSource } = await import('./wordAudioLookup.js')

// Прогрев библиотеки озвучки слов: один запрос по ключам, отдельный кэш, повторно не спрашиваем, источник для подстановки
function client(rows, { error = null, throws = false } = {}) {
  const calls = []
  const chain = { select: () => chain, eq: () => chain, in: (col, keys) => { calls.push(keys); if (throws) throw new Error('net'); return Promise.resolve({ data: rows.filter(r => keys.includes(r.key)), error }) } }
  return { from: vi.fn(() => chain), calls }
}
const row = (key, extra = {}) => ({ key, text: key, url: `https://r2/${key}.mp3`, duration: 0.5, voice_id: 'v', ...extra })

beforeEach(() => { resetWordAudioEnsure(); api.__setCache(null) })

describe('ensureWordAudio', () => {
  it('один запрос на пачку слов по ключам wordKey; найденные попадают в кэш и читаются синхронно', async () => {
    const c = client([row('cheese'), row('ice cream')])
    const changed = await ensureWordAudio(['Cheese,', 'ice  cream', 'bread', 'сыр', ''], { client: c })
    expect(changed).toBe(true)
    expect(c.from).toHaveBeenCalledTimes(1)
    expect(c.calls[0].sort()).toEqual(['bread', 'cheese', 'ice cream'])   // кириллица и пустое — не спрашиваем
    expect(wordAudioRow('cheese').url).toBe('https://r2/cheese.mp3')
    expect(wordAudioRow('bread')).toBeNull()
  })
  it('уже известные слова не запрашиваются; слова, которых нет в базе, не спрашиваются повторно до TTL', async () => {
    const c = client([row('cheese')])
    await ensureWordAudio(['cheese', 'bread'], { client: c })
    expect(await ensureWordAudio(['cheese', 'bread'], { client: c })).toBe(false)
    expect(c.from).toHaveBeenCalledTimes(1)
    let t = 0
    const c2 = client([])
    resetWordAudioEnsure()
    await ensureWordAudio(['bread'], { client: c2, now: () => t })
    t = MISS_TTL_MS + 1
    await ensureWordAudio(['bread'], { client: c2, now: () => t })
    expect(c2.from).toHaveBeenCalledTimes(2)
  })
  it('полный кэш админки (wordAudioApi) главнее частичного и считается «уже есть»', async () => {
    api.__setCache(new Map([['cheese', row('cheese', { url: 'https://r2/full.mp3' })]]))
    const c = client([])
    expect(await ensureWordAudio(['cheese'], { client: c })).toBe(false)
    expect(c.from).not.toHaveBeenCalled()
    expect(wordAudioRow('cheese').url).toBe('https://r2/full.mp3')
  })
  it('ошибка сети/RLS не бросает: слово остаётся без аудио', async () => {
    expect(await ensureWordAudio(['cheese'], { client: client([], { throws: true }) })).toBe(false)
    expect(await ensureWordAudio(['bread'], { client: client([], { error: { message: 'rls' } }) })).toBe(false)
    expect(wordAudioRow('cheese')).toBeNull()
  })
})

describe('wordAudioLookup', () => {
  it('источник по умолчанию — кэш ensure; Map/объект/функция/null в опциях; запись → { url, duration, voiceId }', async () => {
    await ensureWordAudio(['cheese'], { client: client([row('cheese', { duration: 0.7 })]) })
    expect(hasWordAudioSource()).toBe(true)
    expect(lookupWordAudio('Cheese!')).toEqual({ url: 'https://r2/cheese.mp3', duration: 0.7, voiceId: 'v' })
    expect(lookupWordAudio('cheese', null)).toBeNull()
    expect(lookupWordAudio('cheese', { cheese: { url: 'u' } }).url).toBe('u')
    expect(lookupWordAudio('сыр', { сыр: { url: 'u' } })).toBeNull()
    expect(toLookup(5)).toBeNull()
  })
})
