import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { emptyLevel } from './levelModel.js'

// Тесты идут в node без DOM — хранилище, window и document подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}
globalThis.window = new EventTarget()
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' })

// Подписка на журнал и API профиля подменены: проверяем только связку событий, хранения и задержки
const hoisted = vi.hoisted(() => ({ listener: null, offSpy: null }))
vi.mock('../analytics/track.js', () => ({
  onTrack: fn => { hoisted.listener = fn; hoisted.offSpy = vi.fn(() => { hoisted.listener = null }); return hoisted.offSpy },
}))
const api = vi.hoisted(() => ({ loadLevelProfile: vi.fn(), saveLevelProfile: vi.fn() }))
vi.mock('../../api/levelApi.js', () => api)

const feed = await import('./levelFeed.js')
const { loadLevel, saveLevel, LEVEL_KEY } = await import('./levelStore.js')

const emit = (name, props) => hoisted.listener(name, props)
const withObs = (n = 3) => {
  const l = emptyLevel()
  return { ...l, ear: { level: 0.7, sigma: 0.2, n }, vocab: { level: 0.6, sigma: 0.2, n } }
}

beforeEach(() => {
  vi.useFakeTimers()
  localStorage.clear()
  feed._resetLevelFeed()
  api.loadLevelProfile.mockReset().mockResolvedValue(emptyLevel())
  api.saveLevelProfile.mockReset().mockResolvedValue(true)
})
afterEach(() => { feed._resetLevelFeed(); vi.useRealTimers() })

describe('levelFeed: события → уровень', () => {
  it('ответ меняет уровень, пишет локальную копию и уведомляет подписчика', async () => {
    await feed.startLevelTracking()
    const seen = vi.fn()
    feed.subscribeLevel(seen)
    emit('lesson_answer', { lesson_id: 'l', ok: false })
    expect(feed.getLevel().vocab.n).toBe(1)
    expect(feed.getLevel().vocab.level).toBeLessThan(0.5)
    expect(loadLevel().vocab.n).toBe(1)
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('сложность слайдов берётся из setModuleLookup', async () => {
    await feed.startLevelTracking()
    feed.setModuleLookup(feed.lookupFromModules([{ id: 'm1', difficulty: 3, difficultyVotes: 9 }, { id: 'm2', difficulty: 3, difficultyVotes: 1 }], 5))
    emit('feed_swipe', { from: 'm2', to: 'm1', ms_prev: 500 }) // сложность m2 пока не известна (мало голосов)
    expect(feed.getLevel().ear.n).toBe(0)
    emit('feed_swipe', { from: 'm1', to: 'm2', ms_prev: 500 }) // сложное быстро пролистано → «слишком сложно»
    expect(feed.getLevel().ear.n).toBe(1)
    expect(feed.getLevel().ear.level).toBeLessThan(0.5)
  })

  it('неоднозначный сигнал и чужие события уровень не меняют', async () => {
    await feed.startLevelTracking()
    const before = feed.getLevel()
    emit('feed_like', { module_id: 'm1', on: true })
    emit('feed_swipe', { from: 'нет', to: 'b', ms_prev: 300 })
    expect(feed.getLevel()).toBe(before)
  })

  it('голос сложности попадает в модель', async () => {
    await feed.startLevelTracking()
    feed.reportDifficultyVote('m1', 3)
    expect(feed.getLevel().ear.n).toBe(1)
  })

  it('stopLevelTracking отписывается от журнала', async () => {
    await feed.startLevelTracking()
    feed.stopLevelTracking()
    expect(hoisted.offSpy).toHaveBeenCalled()
    expect(hoisted.listener).toBeNull()
  })
})

describe('levelFeed: сохранение на сервер', () => {
  it('гость на сервер не пишет', async () => {
    await feed.startLevelTracking()
    emit('lesson_answer', { ok: true })
    await vi.advanceTimersByTimeAsync(feed.SERVER_SAVE_MS + 1)
    expect(api.saveLevelProfile).not.toHaveBeenCalled()
  })

  it('вошедший: серия сигналов — один запрос через 20 с', async () => {
    await feed.startLevelTracking({ userId: 'u1' })
    for (let i = 0; i < 4; i++) emit('lesson_answer', { ok: true })
    await vi.advanceTimersByTimeAsync(feed.SERVER_SAVE_MS - 100)
    expect(api.saveLevelProfile).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(200)
    expect(api.saveLevelProfile).toHaveBeenCalledTimes(1)
    expect(api.saveLevelProfile.mock.calls[0][0].vocab.n).toBe(4)
  })

  it('pagehide отправляет сразу', async () => {
    await feed.startLevelTracking({ userId: 'u1' })
    emit('lesson_answer', { ok: true })
    window.dispatchEvent(new Event('pagehide'))
    expect(api.saveLevelProfile).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(feed.SERVER_SAVE_MS + 1)
    expect(api.saveLevelProfile).toHaveBeenCalledTimes(1)
  })
})

describe('levelFeed: вход и выход', () => {
  it('старт читает профиль с сервера', async () => {
    api.loadLevelProfile.mockResolvedValue(withObs(1))
    await feed.startLevelTracking({ userId: 'u1' })
    expect(feed.getLevel().ear.level).toBe(0.7)
  })

  it('вход при пустом сервере и наблюдениях гостя — локальный уровень уходит на сервер', async () => {
    await feed.startLevelTracking()
    emit('lesson_answer', { ok: false })
    const guest = feed.getLevel()
    await feed.setLevelUser('u1')
    expect(api.saveLevelProfile).toHaveBeenCalledTimes(1)
    expect(api.saveLevelProfile.mock.calls[0][0]).toEqual(guest)
    expect(feed.getLevel()).toEqual(guest)
  })

  it('вход, когда на сервере уже есть уровень, — серверный побеждает, перенос не нужен', async () => {
    await feed.startLevelTracking()
    emit('lesson_answer', { ok: false })
    api.loadLevelProfile.mockResolvedValue(withObs(1))
    await feed.setLevelUser('u1')
    expect(api.saveLevelProfile).not.toHaveBeenCalled()
    expect(feed.getLevel().ear.level).toBe(0.7)
  })

  it('вход без наблюдений гостя ничего на сервер не шлёт', async () => {
    await feed.startLevelTracking()
    await feed.setLevelUser('u1')
    expect(api.saveLevelProfile).not.toHaveBeenCalled()
  })

  it('гонка «гость → вошедший» без наблюдений: на сервер не уходят начальные 0.5/0.35', async () => {
    // Первая загрузка (гость) ещё в пути, когда приходит вход; её ответ подменяет объект уровня пустым профилем,
    // и вторая загрузка видит «уровень сменился». Раньше это считалось «пришли сигналы» и через 20 с на сервер
    // улетал set_level_profile с начальными значениями (упало в CI: newbie-persona-user, шаг A2.server)
    let releaseGuest
    api.loadLevelProfile
      .mockImplementationOnce(() => new Promise(r => { releaseGuest = () => r(emptyLevel()) }))
      .mockResolvedValueOnce(emptyLevel())
    const guest = feed.startLevelTracking()
    const login = feed.setLevelUser('u1')
    releaseGuest()
    await Promise.all([guest, login])
    await vi.advanceTimersByTimeAsync(feed.SERVER_SAVE_MS + 1000)
    expect(api.saveLevelProfile).not.toHaveBeenCalled()
    expect(feed.getLevel().ear.n).toBe(0)
  })

  it('выход чистит уровень устройства', async () => {
    saveLevel(withObs())
    await feed.startLevelTracking({ userId: 'u1' })
    await feed.setLevelUser('')
    expect(feed.getLevel().ear.n).toBe(0)
    expect(localStorage.getItem(LEVEL_KEY)).toBeNull()
  })

  it('тот же пользователь повторно профиль не перечитывает', async () => {
    await feed.startLevelTracking({ userId: 'u1' })
    await feed.setLevelUser('u1')
    expect(api.loadLevelProfile).toHaveBeenCalledTimes(1)
  })
})
