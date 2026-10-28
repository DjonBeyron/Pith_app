import { describe, it, expect, beforeEach } from 'vitest'

// Тесты идут в node без DOM — хранилище подменяем до импорта модуля
const store = new Map()
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear(),
}

const { loadLadder, saveLadder, ensureLadder, markShown, markDone, normalizeLadder } = await import('./ladderStore.js')
const { LADDER_KEY } = await import('./ladderRules.js')

beforeEach(() => localStorage.clear())

describe('ladderStore', () => {
  it('ключ с префиксом pithy_ (песочница «Я новенький» переписывает такие ключи)', () => {
    expect(LADDER_KEY).toBe('pithy_ladder_v1')
  })

  it('пусто или без firstDay — null', () => {
    expect(loadLadder()).toBeNull()
    localStorage.setItem(LADDER_KEY, JSON.stringify({ done: true }))
    expect(loadLadder()).toBeNull()
    localStorage.setItem(LADDER_KEY, '{не json')
    expect(loadLadder()).toBeNull()
  })

  it('запись и чтение; мусор в полях приводится к виду', () => {
    saveLadder({ firstDay: '2026-10-27', shownDay: '2026-10-28', done: false, ids: ['a', 'b'], tries: 1 })
    expect(loadLadder()).toEqual({ firstDay: '2026-10-27', shownDay: '2026-10-28', done: false, ids: ['a', 'b'], tries: 1 })
    expect(normalizeLadder({ firstDay: 'вчера', ids: [1, 'x'], tries: -3, done: 'да' }))
      .toEqual({ firstDay: '', shownDay: '', done: false, ids: ['x'], tries: 0 })
  })

  it('ensureLadder: первая загрузка пишет firstDay и не закрывает лесенку', () => {
    expect(ensureLadder({ today: '2026-10-27', sessions: 1 })).toEqual({ firstDay: '2026-10-27', shownDay: '', done: false, ids: [], tries: 0 })
    expect(loadLadder().firstDay).toBe('2026-10-27')
  })

  it('ensureLadder: записи нет, а визитов уже два+ — старый пользователь, лесенки не будет (done)', () => {
    expect(ensureLadder({ today: '2026-10-28', sessions: 5 }).done).toBe(true)
    expect(loadLadder()).toMatchObject({ firstDay: '2026-10-28', done: true })
  })

  it('ensureLadder не перетирает существующую запись', () => {
    saveLadder({ firstDay: '2026-10-01', ids: ['a'] })
    expect(ensureLadder({ today: '2026-10-28', sessions: 9 }).firstDay).toBe('2026-10-01')
  })

  it('markShown: запоминает день и фразы; попытка считается один раз в день', () => {
    saveLadder({ firstDay: '2026-10-27' })
    const plan = [{ id: 'a', difficulty: 1 }, { id: 'b', difficulty: 2 }]
    markShown(plan, '2026-10-28')
    markShown(plan, '2026-10-28') // перезагрузка в тот же день
    expect(loadLadder()).toMatchObject({ shownDay: '2026-10-28', ids: ['a', 'b'], tries: 1, done: false })
    markShown(plan, '2026-10-29')
    expect(loadLadder().tries).toBe(2)
  })

  it('markShown и markDone без записи ничего не создают; markDone закрывает лесенку', () => {
    markShown([{ id: 'a', difficulty: 1 }], '2026-10-28')
    markDone()
    expect(loadLadder()).toBeNull()
    saveLadder({ firstDay: '2026-10-27' })
    markDone()
    expect(loadLadder().done).toBe(true)
  })
})
