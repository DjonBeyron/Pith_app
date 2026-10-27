import { onTrack, track } from '../../../shared/lib/analytics/track.js'
import { FEED_SWIPE, FEED_GAME_SHOWN, FEED_GAME_ANSWER, PROMPT_ANSWER, PROMPT_DISMISS } from '../../../shared/lib/analytics/eventNames.js'
import { currentGroup, allowedInGroup } from '../../../shared/lib/prompts/promptGroup.js'
import { resolveTeacher } from '../../../shared/lib/teacherResolve.js'
import { localToday } from '../../review/reviewDecks.js'
import { pickChooseCard, textOnly } from './chooseTasks.js'
import { canOfferChoose, markChooseShown, readChooseDay, writeChooseDay } from './chooseLimits.js'
import { loadChooseDecks } from './chooseLoad.js'

// Игра ленты «Выбери слово» без React (хук — useFeedChoose.js): так вся последовательность проверяется обычными
// тестами с фейковым слотом. Путь: считаем смены слайда (feed_swipe) → после CHOOSE_AFTER слайдов лениво грузим колоды →
// по лимитам (chooseLimits.js) берём карточку и просим у единого бюджета Пита предложение
// «Пит нашёл игру на минутку — выберешь слово?» (его рисует PromptSheet) → слот выбрал предложение (оно на экране) —
// записываем показ в лимиты → ответ «Давай» (prompt_answer с id предложения) открывает игру, «Не сейчас»/крестик — ничего.
// Звук проверяется в момент открытия: нет звука — текстовая версия карточки (chooseTasks.textOnly).
// Вне хоста слота (тесты, превью) предложить нечем — игра молчит.
export const CHOOSE_AFTER = 3 // слайдов до загрузки колод (не грузим тяжёлый запрос на старте ленты)
export const CHOOSE_PREFIX = 'choose:'
export const GAME = 'choose'

export const chooseCandidate = word => ({
  id: CHOOSE_PREFIX + word,
  kind: 'offer',
  reason: 'game_offer',
  text: 'Пит нашёл игру на минутку — выберешь слово?',
  answers: [{ id: 'go', label: 'Давай' }, { id: 'no', label: 'Не сейчас' }],
})

// Свежие значения (слот бюджета, слова в памяти, лента на экране, звук) хук кладёт через setContext({ slot, inMemory,
// enabled, soundOn }); в тестах вместо этого можно передать getSlot/getInMemory/isEnabled/isSoundOn.
// listen/emit/storage/today/group — подмена в тестах
export function createChooseGame(deps = {}) {
  const ctx = { slot: null, inMemory: new Set(), enabled: true, soundOn: true }
  const {
    getSlot = () => ctx.slot, getInMemory = () => ctx.inMemory ?? new Set(), isEnabled = () => !!ctx.enabled,
    isSoundOn = () => !!ctx.soundOn, loadDecks = loadChooseDecks, listen = onTrack, emit = track, storage,
    today = localToday, group = currentGroup, rand = Math.random, now = Date.now,
  } = deps
  let swipes = 0
  let loaded = null // { decks, teacher }
  let loading = false
  let retryAt = 0 // после сбоя загрузки колод пробуем снова не раньше, чем через CHOOSE_AFTER слайдов
  let pending = null // { id, word, card, moduleId, candidate, shown } — предложение, которое просили у слота
  let open = null // открытая игра: { word, card, moduleId, teacher, textOnly, at, result }
  const tried = new Set() // слова, которые уже предлагали (в этой сессии не повторяем)
  const subs = new Set()
  const notify = () => subs.forEach(fn => fn())

  const readDay = () => readChooseDay(today(), storage)

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
      .catch(() => { retryAt = swipes + CHOOSE_AFTER })
      .finally(() => { loading = false; evaluate() })
  }

  // Главное решение. Зовётся при смене слайда, загрузке колод и изменениях вокруг (хук: check)
  function evaluate() {
    const slot = getSlot()
    if (!slot || open) return
    if (!isEnabled()) { release(slot); return }
    if (pending) {
      if (pending.shown) return
      if (slot.current?.id === pending.id) { // слот выбрал предложение — оно на экране: показ идёт в лимиты
        pending.shown = true
        writeChooseDay(markChooseShown(readDay()), storage)
        swipes = 0
      } else slot.request(pending.candidate) // ещё в очереди (или выпало по сроку — запрос повторим)
      return
    }
    if (swipes < CHOOSE_AFTER) return
    if (!allowedInGroup(group(), { reason: 'game_offer' })) return // контрольная группа игр не видит — колоды не грузим
    if (!loaded) { ensureLoaded(); return }
    if (!canOfferChoose({ swipes, state: readDay() })) return
    const pick = pickChooseCard(loaded.decks, { exclude: tried, inMemory: getInMemory(), needText: !isSoundOn(), rand })
    if (!pick) return
    const candidate = chooseCandidate(pick.word)
    pending = { ...pick, id: candidate.id, candidate, shown: false }
    slot.request(candidate)
  }

  function openGame() {
    const p = pending
    pending = null
    const sound = isSoundOn()
    tried.add(p.word)
    open = {
      word: p.word, moduleId: p.moduleId, at: now(), result: null, textOnly: !sound,
      card: sound ? p.card : textOnly(p.card),
      teacher: resolveTeacher(p.card.teacher, loaded?.teacher),
    }
    getSlot()?.setBusy({ input: true }) // пока игра открыта, новые вопросы Пита не перебивают
    emit(FEED_GAME_SHOWN, { game: GAME, word: p.word })
    notify()
  }

  function onEvent(name, props) {
    if (name === FEED_SWIPE) { swipes += 1; queueMicrotask(evaluate); return }
    if (!pending || props?.id !== pending.id) return
    if (name === PROMPT_ANSWER && props.answer === 'go') { openGame(); return }
    if (name === PROMPT_ANSWER || name === PROMPT_DISMISS) { tried.add(pending.word); pending = null } // «Не сейчас», крестик
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
    // Ответ в игре: stats — { wrong, timeMs } от плеера (onFinishStats). Один раз на игру
    answered(stats) {
      if (!open || open.result) return
      const ok = !(stats?.wrong > 0)
      const ms = Number.isFinite(stats?.timeMs) ? stats.timeMs : now() - open.at
      emit(FEED_GAME_ANSWER, { game: GAME, word: open.word, ok, ms })
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
