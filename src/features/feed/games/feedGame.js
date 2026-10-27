import { onTrack, track } from '../../../shared/lib/analytics/track.js'
import { FEED_SWIPE, FEED_GAME_SHOWN, FEED_GAME_ANSWER, PROMPT_ANSWER, PROMPT_DISMISS } from '../../../shared/lib/analytics/eventNames.js'
import { currentGroup, allowedInGroup } from '../../../shared/lib/prompts/promptGroup.js'
import { localToday } from '../../review/reviewDecks.js'
import { canOfferGame, markGameShown, gameRotation, readGamesDay, writeGamesDay } from './gameLimits.js'
import { loadGameData } from './gameLoad.js'

// Ядро игр ленты без React (хук — useFeedGames.js): одна последовательность на все игры, так что лимиты и очередь у них
// общие, а вся цепочка проверяется обычными тестами с фейковым слотом. Путь: считаем смены слайда (feed_swipe) → после
// GAMES_AFTER слайдов лениво грузим колоды → по общим лимитам (gameLimits.js) берём игру ПО ОЧЕРЕДИ (choose → fill →
// picture → …, у кого нет материала — пропускаем) и просим у единого бюджета Пита предложение (его рисует PromptSheet) →
// слот выбрал предложение (оно на экране) — записываем показ в лимиты → ответ «Давай» (prompt_answer с id предложения)
// открывает игру, «Не сейчас»/крестик — ничего. Звук проверяется в момент открытия (isSoundOn): решение «с голосом или
// текстом» принимает вид игры (kind.build). Вне хоста слота (тесты, превью) предложить нечем — игры молчат.
//
// Вид игры (kind) — настройка ядра:
//   { game: 'choose' | 'fill' | 'picture', prefix: 'choose:', text: 'текст предложения Пита',
//     pick(loaded, { exclude, inMemory, sound, needText, rand }) → { word, moduleId, ... } | null  — материал или «нечего»,
//     build(pick, { sound, loaded }) → поля открытой игры (поверх общих: game, word, moduleId, at, result, textOnly) }
export const GAMES_AFTER = 3 // слайдов до загрузки колод (не грузим тяжёлый запрос на старте ленты)

export const gameCandidate = (kind, word) => ({
  id: kind.prefix + word,
  kind: 'offer',
  reason: 'game_offer',
  text: kind.text,
  answers: [{ id: 'go', label: 'Давай' }, { id: 'no', label: 'Не сейчас' }],
})

// Свежие значения (слот бюджета, слова в памяти, лента на экране, звук) хук кладёт через setContext({ slot, inMemory,
// enabled, soundOn }); в тестах вместо этого можно передать getSlot/getInMemory/isEnabled/isSoundOn.
// listen/emit/storage/today/group — подмена в тестах
export function createFeedGame(deps = {}) {
  const ctx = { slot: null, inMemory: new Set(), enabled: true, soundOn: true }
  const {
    kinds = [], getSlot = () => ctx.slot, getInMemory = () => ctx.inMemory ?? new Set(), isEnabled = () => !!ctx.enabled,
    isSoundOn = () => !!ctx.soundOn, loadDecks = loadGameData, listen = onTrack, emit = track, storage,
    today = localToday, group = currentGroup, rand = Math.random, now = Date.now,
  } = deps
  const byGame = new Map(kinds.map(k => [k.game, k]))
  let swipes = 0
  let loaded = null // { decks, teacher, ... } — что вернул loadDecks
  let loading = false
  let retryAt = 0 // после сбоя загрузки пробуем снова не раньше, чем через GAMES_AFTER слайдов
  let pending = null // { id, game, word, moduleId, pick, candidate, shown } — предложение, которое просили у слота
  let open = null // открытая игра: { game, word, moduleId, at, result, textOnly, ...поля вида }
  const tried = new Map(kinds.map(k => [k.game, new Set()])) // слова, которые уже предлагали (в этой сессии не повторяем)
  const subs = new Set()
  const notify = () => subs.forEach(fn => fn())

  const readDay = () => readGamesDay(today(), storage)

  function release(slot) {
    // Предложение больше не нужно: убрать из очереди слота (показанное — закрыть ответом 'left')
    const p = pending
    pending = null
    if (p && slot) slot.cancel(p.id)
  }

  function ensureLoaded() {
    if (loaded || loading || swipes < retryAt) return
    loading = true
    loadDecks()
      .then(v => { loaded = v })
      .catch(() => { retryAt = swipes + GAMES_AFTER })
      .finally(() => { loading = false; evaluate() })
  }

  // Следующая игра по очереди, у которой есть материал → { kind, pick } | null
  function nextPick(state) {
    const sound = isSoundOn()
    for (const g of gameRotation([...byGame.keys()], state.last)) {
      const kind = byGame.get(g)
      const pick = kind.pick(loaded, { exclude: tried.get(g), inMemory: getInMemory(), sound, needText: !sound, rand })
      if (pick) return { kind, pick }
    }
    return null
  }

  // Главное решение. Зовётся при смене слайда, загрузке колод и изменениях вокруг (хук: check)
  function evaluate() {
    const slot = getSlot()
    if (!slot || open) return
    if (!isEnabled()) { release(slot); return }
    if (pending) {
      if (pending.shown) return
      if (slot.current?.id === pending.id) { // слот выбрал предложение — оно на экране: показ идёт в лимиты и в очередь игр
        pending.shown = true
        writeGamesDay(markGameShown(readDay(), pending.game), storage)
        swipes = 0
      } else slot.request(pending.candidate) // ещё в очереди (или выпало по сроку — запрос повторим)
      return
    }
    if (swipes < GAMES_AFTER || !byGame.size) return
    if (!allowedInGroup(group(), { reason: 'game_offer' })) return // контрольная группа игр не видит — колоды не грузим
    if (!loaded) { ensureLoaded(); return }
    const state = readDay()
    if (!canOfferGame({ swipes, state })) return
    const next = nextPick(state)
    if (!next) return
    const candidate = gameCandidate(next.kind, next.pick.word)
    pending = {
      id: candidate.id, game: next.kind.game, word: next.pick.word, moduleId: next.pick.moduleId ?? null,
      pick: next.pick, candidate, shown: false,
    }
    slot.request(candidate)
  }

  function openGame() {
    const p = pending
    pending = null
    const sound = isSoundOn()
    tried.get(p.game).add(p.word)
    open = {
      game: p.game, word: p.word, moduleId: p.moduleId, at: now(), result: null, textOnly: !sound,
      ...byGame.get(p.game).build(p.pick, { sound, loaded }),
    }
    getSlot()?.setBusy({ input: true }) // пока игра открыта, новые вопросы Пита не перебивают
    emit(FEED_GAME_SHOWN, { game: p.game, word: p.word })
    notify()
  }

  function onEvent(name, props) {
    if (name === FEED_SWIPE) { swipes += 1; queueMicrotask(evaluate); return }
    if (!pending || props?.id !== pending.id) return
    if (name === PROMPT_ANSWER && props.answer === 'go') { openGame(); return }
    if (name === PROMPT_ANSWER || name === PROMPT_DISMISS) { tried.get(pending.game).add(pending.word); pending = null } // «Не сейчас», крестик
  }

  const game = {
    // Подписка на журнал событий; возвращает отписку (она же снимает предложение и закрывает игру, чтобы не держать слот)
    start() {
      const off = listen(onEvent)
      return () => { off(); release(getSlot()); game.close() }
    },
    check: evaluate,
    setContext(next) { Object.assign(ctx, next) },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
    getOpen: () => open,
    // Ответ в игре: stats — { wrong, timeMs } от плеера/шторки (onFinishStats). Один раз на игру
    answered(stats) {
      if (!open || open.result) return
      const ok = !(stats?.wrong > 0)
      const ms = Number.isFinite(stats?.timeMs) ? stats.timeMs : now() - open.at
      emit(FEED_GAME_ANSWER, { game: open.game, word: open.word, ok, ms })
      open = { ...open, result: { ok, ms } }
      notify()
    },
    close() {
      if (!open) return
      open = null
      getSlot()?.setBusy({ input: false })
      notify()
    },
  }
  return game
}
