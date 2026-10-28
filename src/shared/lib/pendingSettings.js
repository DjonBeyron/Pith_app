// Несохранённые ГЛОБАЛЬНЫЕ настройки, которые правят прямо в редакторе урока (сейчас — реплики кота игры «Повтори за диктором», app_settings). Они не часть урока, поэтому черновик нод про них не знает,
// а автору нужно одно понятное «Сохранить»: пока в реестре есть правка, мигает точка на кнопке «Сохранить» урока (useCanvasDirty), а нажатие кнопки сохраняет и их (flushPending).
// Реестр живёт в памяти страницы: правка переживает сворачивание блока в редакторе (панель читает значение обратно), но не перезагрузку страницы.
import { useSyncExternalStore } from 'react'

const items = new Map() // ключ → { value, flush, label }
const subs = new Set()
const emit = () => subs.forEach(fn => fn())

/** Запомнить несохранённую правку: value — текущее значение (панель вернёт его при повторном открытии), flush — async-функция, которая её записывает, label — как называть в сообщениях */
export function setPending(key, entry) { items.set(key, entry); emit() }
export const getPending = key => items.get(key) ?? null
export function clearPending(key) { if (items.delete(key)) emit() }
export const hasPending = () => items.size > 0
export const pendingLabels = () => [...items.values()].map(e => e.label).filter(Boolean)
export function subscribePending(fn) { subs.add(fn); return () => subs.delete(fn) }

/** Записать одну правку (удалив из реестра при успехе) */
export async function flushOne(key) {
  const e = items.get(key)
  if (!e) return
  await e.flush()
  if (items.get(key) === e) clearPending(key) // за время записи могла появиться новая правка — её не трогаем
}

/** Записать все правки; ошибки собираются — упавшая остаётся в реестре (кнопка продолжит мигать). Бросает Error со списком упавших */
export async function flushPending() {
  const failed = []
  for (const key of [...items.keys()]) {
    try { await flushOne(key) } catch (e) { failed.push(`${items.get(key)?.label ?? key}: ${e?.message ?? e}`) }
  }
  if (failed.length) throw new Error(failed.join('; '))
}

/** React: есть ли несохранённые глобальные правки / есть ли правка с этим ключом */
export const usePendingAny = () => useSyncExternalStore(subscribePending, hasPending)
export const usePendingKey = key => useSyncExternalStore(subscribePending, () => items.has(key))
