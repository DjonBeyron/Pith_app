import { useState, useCallback } from 'react'

// Что развёрнуто в блоке «Шлифовка репетиции»: id карточек этапов и раздела «Настройки» (по умолчанию всё свёрнуто). Развёрнутыми могут быть несколько сразу; список лежит в localStorage браузера
// (pithy_rh_polish_open_v1) и поэтому не сбрасывается ни запуском игры, ни перерисовкой, ни перезагрузкой страницы. Нет хранилища — состояние живёт в памяти.
export const OPEN_KEY = 'pithy_rh_polish_open_v1'
export const SETTINGS_ID = 'settings'

/** Список развёрнутых id из хранилища; мусор и отсутствие хранилища → пусто */
export function readOpen(store = globalThis.localStorage) {
  try { const v = JSON.parse(store?.getItem(OPEN_KEY) ?? 'null'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] }
}
function writeOpen(list, store) { try { store?.setItem(OPEN_KEY, JSON.stringify(list)) } catch { /* хранилище не приняло — останется до перезагрузки в памяти */ } }

export default function usePolishOpen(store = globalThis.localStorage) {
  const [open, setOpen] = useState(() => readOpen(store))
  const toggle = useCallback(id => setOpen(list => { const next = list.includes(id) ? list.filter(x => x !== id) : [...list, id]; writeOpen(next, store); return next }), [store])
  return { isOpen: id => open.includes(id), toggle }
}
