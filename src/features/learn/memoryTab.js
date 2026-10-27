import { useEffect, useState } from 'react'

// Вкладка «Память» на нижней панели у нового пользователя (PLAN_NEW_USER.md → B1, решение №8):
// пока в памяти нет ни одного слова (гость тоже), вкладки нет; с первым словом она появляется,
// иконка мерцает до первого нажатия на неё, после — навсегда обычная. Флаг «вкладку уже
// нажимали» — в localStorage (по образцу memoryFresh.js): мерцание не возвращается никогда.
//
// Таблица решений memoryTabState({ hasWords, fresh, tapped, loaded }):
//   fresh (слово только прилетело)      → видна: blink, если !tapped, иначе normal
//   loaded, hasWords                    → видна: blink, если !tapped, иначе normal
//   loaded, !hasWords, !fresh           → hidden
//   !loaded, tapped                     → normal  (старый пользователь: вкладка не мигает при загрузке)
//   !loaded, !tapped, !fresh            → hidden  (новое устройство: не знаем, есть ли слова)
// «Загружено» = learn.view собран (null — идёт загрузка).
const KEY = 'pithy_memory_tab_seen_v1'
export const HELLO_MS = 3000 // сколько висит строка «Здесь твои слова не потеряются»

export const isMemoryTabTapped = () => { try { return !!localStorage.getItem(KEY) } catch { return false } }

export function markMemoryTabTapped() {
  try { localStorage.setItem(KEY, '1') } catch { /* приватный режим — мерцание до перезагрузки */ }
}

// 'hidden' | 'blink' | 'normal'
export function memoryTabState({ hasWords, fresh, tapped, loaded }) {
  const visible = fresh || (loaded ? hasWords : tapped)
  if (!visible) return 'hidden'
  return tapped ? 'normal' : 'blink'
}

// Строка-приветствие нужна, когда вкладка появилась уже ПОСЛЕ загрузки данных (первое слово), а не
// выросла вместе с загрузкой у пользователя, у которого слова были и раньше
export function shouldGreet(prev, hidden) {
  return prev.hidden && prev.loaded && !hidden
}

// Состояние вкладки + нажатие + приветствие. view — learn.view (null, пока грузится), fresh — точка
// «новое слово» (useMemoryFresh), open — вкладка «Память» сейчас открыта (открыли не нажатием: пуш, мостик)
export function useMemoryTab({ view, fresh, open = false }) {
  const [tapped, setTapped] = useState(isMemoryTabTapped)
  const loaded = !!view
  const state = memoryTabState({ hasWords: loaded && !view.empty, fresh, tapped, loaded })
  const hidden = state === 'hidden'

  // Приветствие: переход «скрыта → видна» после загрузки данных (состояние от прошлого рендера, без эффекта)
  const [prev, setPrev] = useState({ hidden, loaded })
  const [hello, setHello] = useState(false)
  if (prev.hidden !== hidden || prev.loaded !== loaded) {
    setPrev({ hidden, loaded })
    if (shouldGreet(prev, hidden)) setHello(true)
  }
  useEffect(() => {
    if (!hello) return undefined
    const t = setTimeout(() => setHello(false), HELLO_MS)
    return () => clearTimeout(t)
  }, [hello])

  const onTap = () => { markMemoryTabTapped(); setTapped(true) }
  // Вкладку открыли не кнопкой (пуш, мостик) — тоже «нажали»: мерцать дальше незачем
  useEffect(() => {
    if (open && !hidden && !tapped) onTap() // eslint-disable-line react-hooks/set-state-in-effect -- открыта извне: гасим мерцание
  }, [open, hidden, tapped])

  return { state, onTap, hello }
}
