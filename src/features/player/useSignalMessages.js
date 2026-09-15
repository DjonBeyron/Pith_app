import { useState, useRef, useCallback } from 'react'

// Сигнальные сообщения ленты (см. PROJECT.md «Сигналы ошибок», правка
// 2026-09-15). Автор раскритиковал прежний самодельный оверлей
// (SignalOverlay.jsx, удалён): сигнал должен выглядеть и работать ТОЧНО КАК
// ОБЫЧНОЕ СООБЩЕНИЕ ленты своего типа — аудио-сигнал как голосовое, со своей
// волной, стикер как стикер и т.п. Рендер — PlayerSignalMessages.jsx через
// тот же PlayerMessage/resolveModule, что и вся остальная лента: НИКАКОГО
// самодельного рендера по типу здесь больше нет, работает любой тип ноды.
//
// items — журнал сработавших сигналов, сообщение остаётся в ленте НАВСЕГДА,
// как любое обычное (тот же сигнал теоретически может сыграть не раз за
// урок — уникальный key на каждое срабатывание).
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
  const [items, setItems] = useState([]) // [{ key, node }]
  const pending = useRef(new Map()) // key → { release, done, timer }

  const release = useCallback(key => {
    const entry = pending.current.get(key)
    if (!entry || entry.done) return
    entry.done = true
    clearTimeout(entry.timer)
    entry.release?.()
  }, [])

  // node — сработавшая нода-сигнал; onReleased — снятие freeze у ТОЙ
  // панели, что его запустила (TableManualPanel/usePhraseAssembly передают
  // свой signalState.dismissOverlay — blinkIndex/freeze там не тронуты)
  const fire = useCallback((node, onReleased) => {
    const key = `${node.id}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const timer = setTimeout(() => release(key), FALLBACK_MS)
    pending.current.set(key, { release: onReleased, done: false, timer })
    setItems(prev => [...prev, { key, node }])
  }, [release])

  return { items, fire, onMessageDone: release }
}
