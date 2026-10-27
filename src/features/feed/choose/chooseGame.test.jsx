import { describe, it, expect, vi } from 'vitest'
import {
  FEED_SWIPE, FEED_GAME_SHOWN, FEED_GAME_ANSWER, PROMPT_ANSWER, PROMPT_DISMISS,
} from '../../../shared/lib/analytics/eventNames.js'
import { createChooseGame, CHOOSE_AFTER, chooseCandidate } from './chooseGame.js'
import { GAME_PER_DAY as CHOOSE_PER_DAY } from '../games/gameLimits.js'

// Игра «Выбери слово»: путь «слайды → колоды → просьба к слоту → «Давай» → шторка → ответ» с фейковым слотом и своей шиной
// событий (вместо analytics/track.js)
const choice = { id: 'c', type: 'word_choice', typeData: { word_choice: { options: [{ text: 'keep', isCorrect: true }, { text: 'kip' }] } } }
const say = { id: 's', type: 'text', typeData: { text: { text: 'Hi' } } }
const voice = { id: 'v', type: 'audio', typeData: { audio: { text: '' } } }
const deckOf = nodes => ({ phrase: 'p', modules: [{ id: 'm1', title: 'p' }], cards: [{ id: 'k1', nodes, lessonId: 'l1', teacher: {} }] })
const flush = () => new Promise(r => setTimeout(r, 0))

function setup(over = {}) {
  const bus = new Set()
  const fire = (name, props) => bus.forEach(fn => fn(name, props))
  const mem = new Map()
  const slot = { current: null, request: vi.fn(), cancel: vi.fn(), setBusy: vi.fn() }
  const emit = vi.fn()
  const loadDecks = vi.fn(async () => ({ decks: new Map([['keep', deckOf([say, choice])]]), teacher: { name: 'T' } }))
  const state = { slot, enabled: true, sound: true, ...over.state }
  const game = createChooseGame({
    getSlot: () => state.slot, isEnabled: () => state.enabled, isSoundOn: () => state.sound,
    loadDecks, listen: fn => { bus.add(fn); return () => bus.delete(fn) }, emit,
    storage: () => ({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }),
    today: () => '2026-10-27', group: () => 'prompts', rand: () => 0, ...over.deps,
  })
  const off = game.start()
  const swipe = async (n = 1) => { for (let i = 0; i < n; i++) fire(FEED_SWIPE, { dir: 'next' }); await flush() }
  // слот выбрал предложение (оно на экране)
  const shown = () => { slot.current = chooseCandidate('keep'); game.check() }
  return { game, slot, emit, fire, swipe, shown, state, loadDecks, mem, off }
}

describe('игра «Выбери слово»: от слайдов до ответа', () => {
  it('колоды грузятся лениво, после первых слайдов; предложение — только когда прошло 6 слайдов', async () => {
    const t = setup()
    await t.swipe(CHOOSE_AFTER - 1)
    expect(t.loadDecks).not.toHaveBeenCalled()
    await t.swipe(1)
    expect(t.loadDecks).toHaveBeenCalledTimes(1)
    expect(t.slot.request).not.toHaveBeenCalled() // 3 слайда < 6
    await t.swipe(3)
    // слот сам отсекает повторный запрос того же id, поэтому на каждый слайд просим заново (вдруг предложение выпало из очереди)
    expect(t.slot.request).toHaveBeenCalled()
    expect(t.slot.request.mock.calls.at(-1)[0]).toEqual({
      id: 'choose:keep', kind: 'offer', reason: 'game_offer',
      text: 'Пит нашёл игру на минутку — выберешь слово?',
      answers: [{ id: 'go', label: 'Давай' }, { id: 'no', label: 'Не сейчас' }],
    })
  })

  it('«Давай» открывает игру и пишет feed_game_shown; ответ — feed_game_answer; закрытие снимает «занято»', async () => {
    const t = setup()
    await t.swipe(6)
    t.shown()
    t.fire(PROMPT_ANSWER, { id: 'choose:keep', answer: 'go' })
    const open = t.game.getOpen()
    expect(open.word).toBe('keep')
    expect(open.moduleId).toBe('m1')
    expect(open.textOnly).toBe(false)
    expect(open.teacher.name).toBe('T')
    expect(t.emit).toHaveBeenCalledWith(FEED_GAME_SHOWN, { game: 'choose', word: 'keep' })
    expect(t.slot.setBusy).toHaveBeenLastCalledWith({ input: true })

    t.game.answered({ wrong: 0, timeMs: 900 })
    expect(t.emit).toHaveBeenCalledWith(FEED_GAME_ANSWER, { game: 'choose', word: 'keep', ok: true, ms: 900 })
    expect(t.game.getOpen().result.ok).toBe(true)
    t.game.answered({ wrong: 1, timeMs: 5 }) // второй раз — не пишется
    expect(t.emit.mock.calls.filter(c => c[0] === FEED_GAME_ANSWER)).toHaveLength(1)

    t.game.close()
    expect(t.game.getOpen()).toBeNull()
    expect(t.slot.setBusy).toHaveBeenLastCalledWith({ input: false })
  })

  it('ошибка в ответе: ok = false', async () => {
    const t = setup()
    await t.swipe(6)
    t.shown()
    t.fire(PROMPT_ANSWER, { id: 'choose:keep', answer: 'go' })
    t.game.answered({ wrong: 2, timeMs: 1200 })
    expect(t.emit).toHaveBeenCalledWith(FEED_GAME_ANSWER, { game: 'choose', word: 'keep', ok: false, ms: 1200 })
  })

  it('«Не сейчас» и крестик — ничего не открывается, слово больше не предлагается', async () => {
    const t = setup()
    await t.swipe(6)
    t.shown()
    t.fire(PROMPT_ANSWER, { id: 'choose:keep', answer: 'no' })
    expect(t.game.getOpen()).toBeNull()
    expect(t.emit).not.toHaveBeenCalled()
    t.slot.current = null
    await t.swipe(6)
    expect(t.slot.request).toHaveBeenCalledTimes(1) // единственное слово уже предлагали — второго запроса нет

    const u = setup()
    await u.swipe(6)
    u.shown()
    u.fire(PROMPT_DISMISS, { id: 'choose:keep', later: false })
    expect(u.game.getOpen()).toBeNull()
  })

  it('ответ на чужой вопрос Пита игру не открывает', async () => {
    const t = setup()
    await t.swipe(6)
    t.shown()
    t.fire(PROMPT_ANSWER, { id: 'catch:m1', answer: 'go' })
    expect(t.game.getOpen()).toBeNull()
  })

  it('показ записывается в дневной лимит и обнуляет счёт слайдов', async () => {
    const t = setup()
    await t.swipe(6)
    t.shown()
    expect(JSON.parse(t.mem.get('pithy_feed_choose_v1'))).toEqual({ date: '2026-10-27', count: 1, last: 'choose' })
    t.fire(PROMPT_ANSWER, { id: 'choose:keep', answer: 'no' })
    await t.swipe(5)
    expect(t.slot.request).toHaveBeenCalledTimes(1)
  })

  it('дневной лимит выбран — предложения нет', async () => {
    const t = setup()
    t.mem.set('pithy_feed_choose_v1', JSON.stringify({ date: '2026-10-27', count: CHOOSE_PER_DAY }))
    await t.swipe(9)
    expect(t.slot.request).not.toHaveBeenCalled()
  })

  it('без звука открывается текстовая версия: ноды со звуком убраны, плеер играет беззвучно', async () => {
    const t = setup({
      state: { sound: false },
      deps: { loadDecks: vi.fn(async () => ({ decks: new Map([['keep', deckOf([voice, say, choice])]]), teacher: {} })) },
    })
    await t.swipe(6)
    t.shown()
    t.fire(PROMPT_ANSWER, { id: 'choose:keep', answer: 'go' })
    const open = t.game.getOpen()
    expect(open.textOnly).toBe(true)
    expect(open.card.nodes.map(n => n.id)).toEqual(['s', 'c'])
  })

  it('лента не на экране или нет хоста слота — ничего не просим; контрольная группа — и колоды не грузим', async () => {
    const hidden = setup({ state: { enabled: false } })
    await hidden.swipe(9)
    expect(hidden.slot.request).not.toHaveBeenCalled()

    const noHost = setup({ state: { slot: null } })
    await noHost.swipe(9)
    expect(noHost.loadDecks).not.toHaveBeenCalled()

    const control = setup({ deps: { group: () => 'control' } })
    await control.swipe(9)
    expect(control.loadDecks).not.toHaveBeenCalled()
    expect(control.slot.request).not.toHaveBeenCalled()
  })

  it('лента скрылась после просьбы — предложение снимается со слота', async () => {
    const t = setup()
    await t.swipe(6)
    expect(t.slot.request).toHaveBeenCalledTimes(1)
    t.state.enabled = false
    t.game.check()
    expect(t.slot.cancel).toHaveBeenCalledWith('choose:keep')
  })

  it('сбой загрузки колод не ломает ленту и не зацикливает запрос', async () => {
    const failing = vi.fn(async () => { throw new Error('net') })
    const t = setup({ deps: { loadDecks: failing } })
    await t.swipe(CHOOSE_AFTER)
    await flush()
    expect(failing).toHaveBeenCalledTimes(1) // повтор — не раньше, чем через несколько слайдов
    expect(t.slot.request).not.toHaveBeenCalled()
    await t.swipe(CHOOSE_AFTER)
    expect(failing).toHaveBeenCalledTimes(2)
  })

  it('отписка закрывает открытую игру', async () => {
    const t = setup()
    await t.swipe(6)
    t.shown()
    t.fire(PROMPT_ANSWER, { id: 'choose:keep', answer: 'go' })
    t.off()
    expect(t.game.getOpen()).toBeNull()
  })
})
