import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PromptSlotContext } from '../../../shared/lib/prompts/usePromptSlotContext.js'
import { FEED_SWIPE, FEED_GAME_SHOWN, FEED_GAME_ANSWER, PROMPT_ANSWER, PROMPT_DISMISS } from '../../../shared/lib/analytics/eventNames.js'
import { createFeedGames } from './createFeedGames.js'
import { gameCandidate } from './feedGame.js'
import { useFeedGames } from './useFeedGames.js'
import { GAME_PER_DAY, GAMES_KEY } from './gameLimits.js'
import { chooseKind } from '../choose/chooseGame.js'
import { fillKind } from '../fill/fillGame.js'
import { pictureKind } from '../picture/pictureGame.js'

// Три игры в одном ядре: общая очередь (choose → fill → picture), общие лимиты, открытие каждой игры «Давай».
// Слот — фейк, шина событий своя (вместо analytics/track.js); колоды отдаёт loadDecks
const TIMINGS = [{ w: 'I', t: 0.1, e: 0.2 }, { w: 'see', t: 0.3, e: 0.6 }, { w: 'a', t: 0.7, e: 0.8 }, { w: 'sheep', t: 0.9, e: 1.5 }]
const choice = { id: 'c', type: 'word_choice', typeData: { word_choice: { options: [{ text: 'sheep', isCorrect: true }, { text: 'ship' }] } } }
const voice = { id: 'v', type: 'audio', typeData: { audio: { text: 'I see a sheep', r2Url: 'https://r2.dev/a.mp3', wordTimings: TIMINGS } } }
const photos = ['a', 'b', 'c'].map(x => ({ id: x, photoUrl: `https://r2.dev/${x}.png`, imagePrompt: x }))
const photoNode = { id: 'ph', type: 'photo_choice', typeData: { photo_choice: { photos, correctIndexes: [0] } } }
const deckOf = nodes => ({ phrase: 'p', modules: [{ id: 'm1', title: 'p' }], cards: [{ id: 'k1', nodes, lessonId: 'l1', teacher: {} }] })
const emptyDeck = { phrase: 'q', modules: [{ id: 'm2', title: 'q' }], cards: [] }
const flush = () => new Promise(r => setTimeout(r, 0))

function setup({ nodes = [voice, choice, photoNode], mem = new Map(), sound = true } = {}) {
  const bus = new Set()
  const fire = (name, props) => bus.forEach(fn => fn(name, props))
  const slot = { current: null, request: vi.fn(), cancel: vi.fn(), setBusy: vi.fn() }
  const emit = vi.fn()
  const decks = new Map([['sheep', deckOf(nodes)], ['ship', emptyDeck], ['chip', emptyDeck]])
  const wordAudio = new Map([['sheep', { url: 'https://r2.dev/sheep.mp3' }]])
  const state = { sound }
  const game = createFeedGames({
    getSlot: () => slot, isEnabled: () => true, isSoundOn: () => state.sound,
    loadDecks: async () => ({ decks, teacher: { name: 'T' }, wordAudio }),
    listen: fn => { bus.add(fn); return () => bus.delete(fn) }, emit,
    storage: () => ({ getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }),
    today: () => '2026-10-27', group: () => 'prompts', rand: () => 0,
  })
  game.start()
  const swipe = async (n = 1) => { for (let i = 0; i < n; i++) fire(FEED_SWIPE, { dir: 'next' }); await flush() }
  // слот выбрал предложение — оно на экране
  const show = id => { slot.current = { id }; game.check() }
  const offered = () => slot.request.mock.calls.map(c => c[0].id)
  // Весь круг для одного предложения: слайды → показ → ответ
  async function offerAnd(answer, id, swipes = 6) {
    await swipe(swipes)
    show(id)
    fire(answer === 'dismiss' ? PROMPT_DISMISS : PROMPT_ANSWER, answer === 'dismiss' ? { id, later: false } : { id, answer })
    slot.current = null
  }
  return { game, slot, emit, fire, swipe, show, offered, offerAnd, mem, state }
}

describe('игры ленты: общая очередь', () => {
  it('по кругу: choose → fill → picture; каждая игра предлагается своим кандидатом бюджета', async () => {
    const t = setup()
    await t.offerAnd('no', 'choose:sheep')
    await t.offerAnd('no', 'fill:sheep')
    await t.offerAnd('no', 'picture:sheep')
    expect([...new Set(t.offered())]).toEqual(['choose:sheep', 'fill:sheep', 'picture:sheep'])
    const cand = t.slot.request.mock.calls.map(c => c[0]).find(c => c.id === 'fill:sheep')
    expect(cand).toEqual({
      id: 'fill:sheep', kind: 'offer', reason: 'game_offer', scope: 'feed', text: 'Пит нашёл игру на минутку — дополнишь реплику?',
      answers: [{ id: 'go', label: 'Давай' }, { id: 'no', label: 'Не сейчас' }],
    })
    expect(t.slot.request.mock.calls.map(c => c[0]).find(c => c.id === 'picture:sheep').text).toBe('Пит нашёл игру на минутку — угадаешь слово по картинке?')
  })

  it('у игры нет материала — пропускается, очередь идёт дальше (picture без photo_choice)', async () => {
    const t = setup({ nodes: [voice, choice] })
    await t.offerAnd('no', 'choose:sheep')
    await t.offerAnd('no', 'fill:sheep')
    await t.swipe(9)
    expect(t.offered().some(id => id.startsWith('picture:'))).toBe(false)
    expect(t.offered().at(-1)).toBe('fill:sheep') // больше предлагать нечего: все слова уже предлагали
  })

  it('очередь помнит показанную последней игру: после fill идёт picture; после picture без материала — choose', async () => {
    const afterFill = setup({ mem: new Map([[GAMES_KEY, JSON.stringify({ date: '2026-10-27', count: 1, last: 'fill' })]]) })
    await afterFill.swipe(6)
    expect(afterFill.offered().at(-1)).toBe('picture:sheep')
    const wrap = setup({ nodes: [voice, choice], mem: new Map([[GAMES_KEY, JSON.stringify({ date: '2026-10-27', count: 1, last: 'fill' })]]) })
    await wrap.swipe(6)
    expect(wrap.offered().at(-1)).toBe('choose:sheep') // picture нет — по кругу снова choose
  })

  it('нет материала ни у одной игры — молчим', async () => {
    const t = setup({ nodes: [{ id: 's', type: 'text', typeData: { text: { text: 'Hi' } } }] })
    await t.swipe(12)
    expect(t.slot.request).not.toHaveBeenCalled()
  })

  it('«Не сейчас» и крестик гасят слово только для этой игры', async () => {
    const t = setup()
    await t.offerAnd('dismiss', 'choose:sheep')
    await t.offerAnd('no', 'fill:sheep')
    expect(t.game.getOpen()).toBeNull()
    await t.swipe(6)
    expect(t.offered().at(-1)).toBe('picture:sheep') // слово «sheep» для picture ещё не предлагали
  })
})

describe('игры ленты: общие лимиты', () => {
  it('не чаще раза в 6 слайдов — на все игры вместе', async () => {
    const t = setup()
    await t.offerAnd('no', 'choose:sheep')
    t.slot.request.mockClear()
    await t.swipe(5)
    expect(t.slot.request).not.toHaveBeenCalled()
    await t.swipe(1)
    expect(t.offered()).toEqual(['fill:sheep'])
  })

  it('не больше 4 в день на все игры вместе; показ пишет дневной счётчик и очередь', async () => {
    const mem = new Map([[GAMES_KEY, JSON.stringify({ date: '2026-10-27', count: GAME_PER_DAY - 1, last: 'choose' })]])
    const t = setup({ mem })
    await t.swipe(6)
    t.show('fill:sheep')
    expect(JSON.parse(mem.get(GAMES_KEY))).toEqual({ date: '2026-10-27', count: GAME_PER_DAY, last: 'fill' })
    t.fire(PROMPT_ANSWER, { id: 'fill:sheep', answer: 'no' })
    t.slot.current = null
    t.slot.request.mockClear()
    await t.swipe(20)
    expect(t.slot.request).not.toHaveBeenCalled()
  })

  it('контрольная группа игр не видит', async () => {
    const bus = new Set()
    const slot = { current: null, request: vi.fn(), cancel: vi.fn(), setBusy: vi.fn() }
    const loadDecks = vi.fn(async () => ({ decks: new Map(), teacher: null }))
    const g = createFeedGames({ getSlot: () => slot, loadDecks, listen: fn => { bus.add(fn); return () => bus.delete(fn) }, group: () => 'control', storage: () => null })
    g.start()
    for (let i = 0; i < 9; i++) bus.forEach(fn => fn(FEED_SWIPE, {}))
    await flush()
    expect(loadDecks).not.toHaveBeenCalled()
    expect(slot.request).not.toHaveBeenCalled()
  })
})

describe('игры ленты: открытие и ответ', () => {
  it('«Дополни реплику»: «Давай» открывает задачу со звуком, ответ пишет game: fill', async () => {
    const t = setup()
    await t.offerAnd('no', 'choose:sheep')
    await t.swipe(6)
    t.show('fill:sheep')
    t.fire(PROMPT_ANSWER, { id: 'fill:sheep', answer: 'go' })
    const open = t.game.getOpen()
    expect(open.game).toBe('fill')
    expect(open.word).toBe('sheep')
    expect(open.moduleId).toBe('m1')
    expect(open.textOnly).toBe(false)
    expect(open.task.before).toBe('I see a ')
    expect(open.task.audio.steps.map(s => s.stage)).toEqual(['before', 'meow', 'after'])
    expect(t.emit).toHaveBeenCalledWith(FEED_GAME_SHOWN, { game: 'fill', word: 'sheep' })
    expect(t.slot.setBusy).toHaveBeenLastCalledWith({ input: true })
    t.game.answered({ wrong: 1, timeMs: 3000 })
    expect(t.emit).toHaveBeenCalledWith(FEED_GAME_ANSWER, { game: 'fill', word: 'sheep', ok: false, ms: 3000 })
    t.game.close()
    expect(t.slot.setBusy).toHaveBeenLastCalledWith({ input: false })
  })

  it('«Картинка»: открывается с тремя картинками и озвучкой слова; ответ — game: picture', async () => {
    const t = setup({ mem: new Map([[GAMES_KEY, JSON.stringify({ date: '2026-10-27', count: 0, last: 'fill' })]]) })
    await t.swipe(6)
    t.show('picture:sheep')
    t.fire(PROMPT_ANSWER, { id: 'picture:sheep', answer: 'go' })
    const open = t.game.getOpen()
    expect(open.game).toBe('picture')
    expect(open.task.options).toHaveLength(3)
    expect(open.task.audioUrl).toBe('https://r2.dev/sheep.mp3')
    t.game.answered({ wrong: 0, timeMs: 800 })
    expect(t.emit).toHaveBeenCalledWith(FEED_GAME_ANSWER, { game: 'picture', word: 'sheep', ok: true, ms: 800 })
  })

  it('звук проверяется в момент показа: выключили до «Давай» — реплика текстом, слово текстом', async () => {
    const t = setup()
    await t.offerAnd('no', 'choose:sheep')
    await t.swipe(6)
    t.show('fill:sheep')
    t.state.sound = false
    t.fire(PROMPT_ANSWER, { id: 'fill:sheep', answer: 'go' })
    expect(t.game.getOpen().textOnly).toBe(true)
    expect(t.game.getOpen().task.audio).toBeNull()
    t.game.close()

    const p = setup({ mem: new Map([[GAMES_KEY, JSON.stringify({ date: '2026-10-27', count: 0, last: 'fill' })]]) })
    await p.swipe(6)
    p.show('picture:sheep')
    p.state.sound = false
    p.fire(PROMPT_ANSWER, { id: 'picture:sheep', answer: 'go' })
    expect(p.game.getOpen().task.audioUrl).toBeNull()
  })

  it('«Выбери слово» в общем ядре работает как раньше: карточка, учитель, текстовая версия', async () => {
    const t = setup()
    await t.swipe(6)
    t.show('choose:sheep')
    t.fire(PROMPT_ANSWER, { id: 'choose:sheep', answer: 'go' })
    const open = t.game.getOpen()
    expect(open.game).toBe('choose')
    expect(open.card.nodes.map(n => n.id)).toContain('c')
    expect(open.teacher.name).toBe('T')
  })
})

describe('gameCandidate и useFeedGames', () => {
  it('кандидат бюджета у каждой игры: offer / game_offer, «Давай» и «Не сейчас»', () => {
    for (const kind of [chooseKind, fillKind, pictureKind]) {
      const c = gameCandidate(kind, 'keep')
      expect(c).toMatchObject({ id: `${kind.game}:keep`, kind: 'offer', reason: 'game_offer' })
      expect(c.answers.map(a => a.id)).toEqual(['go', 'no'])
    }
  })

  const Probe = () => {
    const g = useFeedGames({ inMemory: new Map(), enabled: true, soundOn: true })
    return <i data-open={String(!!g.open)} />
  }
  it('без хоста слота и со слотом игра по умолчанию закрыта, просьб на рендере нет', () => {
    expect(renderToStaticMarkup(<Probe />)).toContain('data-open="false"')
    const slot = { current: null, request: vi.fn(), cancel: vi.fn(), setBusy: vi.fn() }
    expect(renderToStaticMarkup(<PromptSlotContext.Provider value={slot}><Probe /></PromptSlotContext.Provider>)).toContain('data-open="false"')
    expect(slot.request).not.toHaveBeenCalled()
  })
})
