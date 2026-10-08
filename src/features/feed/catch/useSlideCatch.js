import { useEffect, useMemo, useRef, useState } from 'react'
import { catchHeard, catchHelp } from '../../../shared/api/catchApi.js'
import { track } from '../../../shared/lib/analytics/track.js'
import { catchWords, catchEligible, catchSignal } from './feedCatch.js'
import { catchKeyboard } from './catchLetters.js'
import { getForcedCatch, clearForcedCatch, forcedKnowledge, onForcedCatch } from './catchForce.js'
import * as cs from './catchState.js'

export const CATCH_COVER_OUT_MS = 500 // страховка: накрытие размонтируется по transitionend (CatchCover), но не позже этого (feed-catch.css: уход панели 260мс)
const LEARN_SYNC_DELAY_MS = 450 // память «Моего обучения» обновляем после ухода накрытия и проявления фразы (200мс)
// Действия, которые хук отдаёт наружу: через стабильные обёртки (см. конец хука), чтобы набор клавиш не менял пропсы
// мемоизированных детей (CatchSheet, CatchStripPhrase, PhraseWords) — иначе каждая клавиша перерисовывала бы весь слайд
const ACTIONS = ['openSheet', 'setCurrent', 'press', 'backspace', 'next', 'prev', 'check', 'help', 'reveal', 'finish', 'coverGone']

// «Ловля слов» на одном слайде ленты (спек v2: чип поверх шариков → шторка с клавиатурой + полоска фразы,
// слова по порядку, «Проверить» — финал со сравнением). Решение «задание есть на этом слайде»: слова фразы с уровнями
// по памяти (catchWords), фраза подходит (catchEligible: включено у модуля, нет слова «Помнишь?», есть свои слова ≥2)
// и лента разрешила (feedCatch.claim — лимиты, один раз на модуль). Переходы состояния — catchState.js (чистые),
// здесь — их связка с React, сигналы в память и аналитика.
// Сигналы (catchApi): при check — за каждое своё слово (уровень ≥2), набранное верно и без подсказки → catchHeard;
// при help — сразу catchHelp (своё слово); при reveal — ничего. Пока накрытие в DOM — onLock(true): лента не свайпается
// (снимается, когда накрытие размонтировано, а не в кадре старта ухода — onLock перерисовывает всю ленту).
// «Готово» идёт строго по порядку, без работы в первых кадрах анимации ухода: фраза под накрытием уже подготовлена
// (FeedSlide + useCatchPrepare: открытая, под скрытым блоком) и на done открывается мгновенно, накрытие уезжает вниз
// (260мс), содержимое при этом уходит в заливку цвета панели → размонтирование по transitionend transform блока
// (coverGone; страховка — таймер CATCH_COVER_OUT_MS; finished: слайд
// становится обычным открытым, onPhraseOpened) → через LEARN_SYNC_DELAY_MS память «Моего обучения» обновляется
// (onLearnChanged), если был сигнал.
// Когда решать. Чип должен быть в самом первом кадре слайда, иначе при свайпе сначала виден спойлер (картинка покоя),
// а потом он превращается в плашку: FeedSwiper даёт active=true только после конца анимации свайпа. Поэтому решение
// «задание есть» принимается раньше: ahead (слайд — следующий за активным) или active; принудительное — уже у любого
// соседа (near, лимитов у него нет). Пройденный слайд (near, но не ahead) новое задание не получает — иначе он занял
// бы лимит, который ждёт следующий.
// Принудительное задание (Админ → Ловля → «Отправить в ленту», catchForce.js): на слайде своей фразы знание слов =
// уровни из песочницы (не память), задание есть всегда (recall/флаг модуля не важны), feedCatch.claim обходится (лимиты
// не считаются), сигналы в память — только при writeMemory; «Готово» и «Раскрыть» снимают его (разово).
// → { active, open, mounted, phase, done, finished, revealed, shift, words, cur, curIndex, typed, typedBy, helped, helpedSet, model,
//     results, isLast, hasPrev, openSheet(), setCurrent(index), press(ch), backspace(), next(), prev(), check(), help(),
//     reveal(), finish(), coverGone() } — функции стабильны (одни и те же между рендерами, всегда зовут свежую версию)
export function useSlideCatch({ feedCatch, mod, active, near = false, ahead = false, knowledge, recallIndex, onLock, onLearnChanged }) {
  // sessionStorage читаем на монтирование/смену фразы и когда админ выставил задание заново (forcedTick), не в каждом рендере
  const [forcedTick, setForcedTick] = useState(0)
  useEffect(() => onForcedCatch(() => setForcedTick(t => t + 1)), [])
  const forced = useMemo(() => {
    const f = getForcedCatch()
    return f?.moduleId === mod.id ? f : null
  }, [mod.id, forcedTick]) // eslint-disable-line react-hooks/exhaustive-deps
  const effKnowledge = useMemo(
    () => (forced ? forcedKnowledge(catchWords(mod.title, null), forced.levels) : knowledge),
    [forced, mod.title, knowledge],
  )
  const words = useMemo(() => catchWords(mod.title, effKnowledge), [mod.title, effKnowledge])
  const eligible = forced ? true : catchEligible(words, { enabled: mod.feedCatchEnabled, recallIndex })
  const writeSignals = !forced || forced.writeMemory
  // Решение «задание есть» принимается синхронно в рендере — первый же кадр слайда с заданием уже показывает чип, без
  // мелькания шариков и лишнего рендера. claim идемпотентен для одного модуля (offered Set в useFeedCatch), повторный
  // рендер (StrictMode, пересборка) безопасен; ref хранит id фразы с заданием — при смене модуля сравнение даёт false
  const claimedRef = useRef(null)
  const mayDecide = forced ? active || near : active || ahead
  if (mayDecide && eligible && claimedRef.current !== mod.id && (forced || feedCatch?.claim(mod.id, !active))) claimedRef.current = mod.id
  const claimed = claimedRef.current === mod.id

  const [st, setSt] = useState(() => cs.initialCatch(mod.id))
  // Админ выставил задание заново — состояние слайда с нуля (сброс при рендере)
  const [seenForced, setSeenForced] = useState(forced)
  if (seenForced !== forced) {
    setSeenForced(forced)
    if (forced) setSt(cs.initialCatch(mod.id))
  }
  // Лента подменила фразу в этой копии слайда — состояние с нуля; слайд ушёл с экрана — шторка закрыта
  // (сброс при рендере, не в эффекте — как в useTranslationReveal)
  if (st.modId !== mod.id) setSt(cs.initialCatch(mod.id))
  else if (!active && st.open) setSt(cs.closeSheet(st))
  const s = st.modId !== mod.id ? cs.initialCatch(mod.id) : active ? st : cs.closeSheet(st)
  const update = fn => setSt(p => (p.modId === mod.id ? fn(p) : p))

  const open = active && s.open
  const lockRef = useRef(onLock)
  useEffect(() => { lockRef.current = onLock })
  useEffect(() => () => lockRef.current?.(false), [])

  // Накрытие остаётся в DOM, пока доигрывает уход (панель уезжает вниз, содержимое уходит в заливку): CatchCover сообщает о конце перехода (coverGone), таймер
  // CATCH_COVER_OUT_MS — страховка (closing поднимается при рендере в момент закрытия)
  const [closing, setClosing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    const t = setTimeout(() => setClosing(false), CATCH_COVER_OUT_MS)
    return () => clearTimeout(t)
  }, [closing])
  const mounted = open || closing
  const coverGone = () => setClosing(false)

  // Блокировка свайпа — пока накрытие в DOM на активном слайде (снимается после ухода накрытия, не в его первом кадре)
  useEffect(() => { lockRef.current?.(mounted) }, [mounted])

  // «Готово» отработало и накрытие ушло — слайд можно делать обычным открытым (FeedSlide), память — позже
  const finished = s.done && !mounted

  // Был сигнал в память — сообщаем ленте после «Готово», когда накрытие ушло и фраза проявилась (или когда слайд
  // размонтирован раньше — тогда сразу): перерисовка ленты/ранга не попадает в анимацию ухода
  const dirty = useRef(false)
  const changedRef = useRef(onLearnChanged)
  useEffect(() => { changedRef.current = onLearnChanged })
  useEffect(() => {
    if (!finished) return
    const t = setTimeout(() => {
      if (dirty.current) { dirty.current = false; changedRef.current?.() }
    }, LEARN_SYNC_DELAY_MS)
    return () => clearTimeout(t)
  }, [finished])
  useEffect(() => () => { if (dirty.current) changedRef.current?.() }, [])

  const cur = s.cur == null ? null : cs.wordAt(words, s.cur)
  const helped = s.cur != null && s.helped.has(s.cur)
  const model = useMemo(() => (cur ? catchKeyboard(cur.text, cur.level) : null), [cur])
  const hasPrev = s.cur != null && words.length > 0 && words[0].index !== s.cur // активное слово не первое
  const started = useRef(null) // id фразы, за которую уже ушло feed_catch_start

  function openSheet() {
    if (s.done || s.open) return
    update(p => cs.openSheet(p, words))
    if (started.current !== mod.id) { started.current = mod.id; track('feed_catch_start', { module_id: mod.id }) }
  }

  const setCurrent = index => update(p => cs.setCurrent(p, words, index))
  const press = ch => update(p => cs.press(p, words, ch))
  const backspace = () => update(cs.backspace)

  // «Следующее слово»; на последнем слове — это «Проверить»
  function next() {
    if (!cur || s.phase !== 'type') return
    if (cs.isLast(s, words)) { check(); return }
    update(p => cs.next(p, words))
    track('feed_catch_next', { level: cur.level, typed: cs.typedOf(s, s.cur).length > 0 })
  }

  // «Предыдущее слово»: вернуться и поправить (набранное у обоих слов остаётся)
  function prev() {
    if (!cur || s.phase !== 'type' || !hasPrev) return
    update(p => cs.prev(p, words))
  }

  // «Проверить» → финал. Сигнал «услышано» — за своё слово, набранное верно и без подсказки
  function check() {
    if (s.phase !== 'type' || s.done) return
    const { state, results } = cs.check(s, words)
    setSt(state)
    for (const r of results) {
      const w = cs.wordAt(words, r.index)
      if (writeSignals && r.ok && w && catchSignal(w.level, s.helped.has(r.index)) === 'heard') {
        dirty.current = true
        catchHeard(w.key, mod.id).catch(() => {})
      }
    }
    track('feed_catch_check', { ok: cs.okCount(results), total: words.length, helped: s.helped.size })
  }

  // «Подсказать»: запутыватели гаснут; своё слово (≥2) — сигнал «не расслышал» сразу, не ждём набора
  function help() {
    if (!cur || helped || s.phase !== 'type' || s.done) return
    update(cs.help)
    if (writeSignals && catchSignal(cur.level, true) === 'help') {
      dirty.current = true
      catchHelp(cur.key, mod.id).catch(() => {})
    }
    track('feed_catch_hint', { level: cur.level })
  }

  // «Раскрыть»: тот же финал, сигналов нет
  function reveal() {
    if (s.phase !== 'type' || s.done) return
    update(p => cs.reveal(p, words))
    if (forced) clearForcedCatch()
    track('feed_catch_reveal', { typed: s.typedBy.size, total: words.length })
  }

  // «Готово»: накрытие уезжает вниз (содержимое уходит в заливку), слайд становится обычным открытым (FeedSlide: revealed=true)
  function finish() {
    if (s.phase !== 'result' || s.done) return
    update(cs.finish)
    if (forced) clearForcedCatch()
    track('feed_catch_finish', { ok: cs.okCount(s.results), total: words.length, revealed: s.revealed })
  }

  // Стабильные действия: обёртки создаются один раз и зовут последнюю версию функций (ref обновляется после каждого рендера)
  const latest = useRef({ openSheet, setCurrent, press, backspace, next, prev, check, help, reveal, finish, coverGone })
  useEffect(() => { latest.current = { openSheet, setCurrent, press, backspace, next, prev, check, help, reveal, finish, coverGone } })
  const [stable] = useState(() => Object.fromEntries(ACTIONS.map(name => [name, (...args) => latest.current[name](...args)])))

  return {
    active: claimed, open, mounted, phase: s.phase, done: s.done, finished, revealed: s.revealed, forced: !!forced,
    shift: cs.shiftOn(s, words), words,
    cur, curIndex: s.cur, typed: s.cur == null ? '' : cs.typedOf(s, s.cur), typedBy: s.typedBy,
    helped, helpedSet: s.helped, model, results: s.results, isLast: cs.isLast(s, words), hasPrev,
    ...stable,
  }
}
