import { useState, useRef, useCallback } from 'react'

// Сигнальные сообщения ленты (см. PROJECT.md «Сигналы ошибок», правки
// 2026-09-15). Автор раскритиковал прежний самодельный оверлей
// (SignalOverlay.jsx, удалён): сигнал должен выглядеть и работать ТОЧНО КАК
// ОБЫЧНОЕ СООБЩЕНИЕ ленты своего типа — аудио-сигнал как голосовое, со своей
// волной, стикер как стикер и т.п. Рендер — PlayerFeedNodes.jsx через тот же
// PlayerMessage/resolveModule, что и вся остальная лента (см.
// shared/lib/feedOrder.js — сигналы вставляются в хронологически верное
// место, а не жёстко в хвост ленты): НИКАКОГО самодельного рендера по типу
// здесь больше нет, работает любой тип ноды.
//
// items — журнал сработавших сигналов, сообщение остаётся в ленте НАВСЕГДА,
// как любое обычное.
//
// !!! Ноды отсюда НИКОГДА не идут в visibleNodes/onNodeDone графа урока
// (useGraphPlayer) — это отдельный, параллельный список, простое смешение
// сломало бы весь прогресс/XP/чекпойнты урока.
const FALLBACK_MS = 6000 // Некоторые типы (word_choice, table, phrase_assembly,
// photo_choice, registration) в ленте — только витрина УЖЕ отвеченного
// состояния (wordChoiceState/phraseState/...): без него их Module ничего не
// рендерит и сам onDone никогда не позовёт. Автор всё же может сослаться на
// такую ноду как на сигнал (пикер её не запрещает, см. NodeSignalsPicker.jsx)
// — страховка отпускает freeze панели по таймеру, чтобы упражнение не
// зависло навсегда.

export function useSignalMessages() {
  const [items, setItems] = useState([]) // [{ key, node, afterVisibleCount }]
  const pending = useRef(new Map()) // key → { nodeId, release, done, timer }
  // Каждая нода-сигнал срабатывает ОДИН РАЗ за весь урок (правка автора: та
  // же ошибка второй раз — уже без бесплатной подсказки, обычным путём).
  // Ref, не state — нужно читать СИНХРОННО из hasFired() в момент проверки
  // ответа, до любого рендера.
  const firedNodeIds = useRef(new Set())

  const hasFired = useCallback(nodeId => firedNodeIds.current.has(nodeId), [])

  const release = useCallback(key => {
    const entry = pending.current.get(key)
    if (!entry || entry.done) return
    entry.done = true
    clearTimeout(entry.timer)
    entry.release?.()
  }, [])

  // node — сработавшая нода-сигнал; onReleased — снятие freeze у ТОЙ панели,
  // что его запустила (TableManualPanel/usePhraseAssembly передают свой
  // signalState.dismissOverlay — blinkIndex/freeze там не тронуты);
  // afterVisibleCount — индекс ноды упражнения в visibleNodes (см.
  // feedOrder.js/LessonPlayer.jsx) — сигнал встаёт ПЕРЕД её собственным
  // слотом, а не просто «после N нод»: слот упражнения рисует ответ ученика
  // (AnswerBubbles) уже ПОСЛЕ того, как сигнал сработал, и должен появиться
  // в ленте позже сигнала, а не раньше.
  //
  // Основная защита от повтора — на стороне вызывающего кода (manualCheck.js/
  // usePhraseAssembly.js: они сверяются с hasFired() ДО того, как решить,
  // что это вообще сигнал, а не обычная ошибка) — здесь тот же guard
  // повторён на всякий случай (защита от гонки при двойном клике/тапе, когда
  // React ещё не успел перерисовать disabled на кнопке «Проверить»).
  const fire = useCallback((node, onReleased, afterVisibleCount) => {
    if (firedNodeIds.current.has(node.id)) return
    firedNodeIds.current.add(node.id)

    const key = `${node.id}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const timer = setTimeout(() => release(key), FALLBACK_MS)
    pending.current.set(key, { nodeId: node.id, release: onReleased, done: false, timer })
    setItems(prev => [...prev, { key, node, afterVisibleCount }])
  }, [release])

  // Удобный вход для панелей: exerciseNodeId — id САМОЙ ноды упражнения
  // (table/phrase_assembly), не ноды-сигнала — ищем её индекс в visibleNodes
  // сами, вызывающему коду (LessonPlayer.jsx) не нужно знать про afterVisibleCount
  const fireForExercise = useCallback((node, onReleased, exerciseNodeId, visibleNodes) => {
    const idx = visibleNodes.findIndex(n => n.id === exerciseNodeId)
    fire(node, onReleased, idx >= 0 ? idx : visibleNodes.length)
  }, [fire])

  return { items, fire, fireForExercise, onMessageDone: release, hasFired }
}
