import { useState, useEffect, useMemo } from 'react'
import { makeSnapshot, diffSnapshots, pushVersion, markCommented } from './lessonVersions.js'
import { fromCanvasNodes } from '../lesson-io/lessonLint.js'

const SHOW_KEY = 'pithy-review-showchanges'
const read = (k, d) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* хранилище недоступно */ } }
const load = key => { try { const v = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] } }

/**
 * Записать версию урока в стопку вне окна разбора: при загрузке урока (первая, базовая) и вокруг импорта JSON (старое состояние → новое). Без этого
 * «предыдущей версии» не было бы до тех пор, пока разбор не открыли хотя бы раз на старом уроке
 */
export function recordLessonVersion(storageId, canvasNodes) {
  if (!storageId || !canvasNodes?.length) return
  const key = `pithy-versions:${storageId}`
  try { localStorage.setItem(key, JSON.stringify(pushVersion(load(key), makeSnapshot(fromCanvasNodes(canvasNodes))))) } catch { /* хранилище недоступно */ }
}

/**
 * Версии урока в разборе (локально): при открытии текущий урок кладётся в стопку версий (если он отличается от последней), «предыдущая версия» — та, что была до
 * него. Кнопка «Изменения» включает розовые полоски у сообщений, которые отличаются от предыдущей версии. notedRefs — ноды с замечаниями (они считаются
 * изменёнными в следующей версии). Без предыдущей версии сравнивать нечего (canCompare = false). Сравнение — только с ПРЕДЫДУЩЕЙ версией;
 * версии пишутся при загрузке (серверная и локальный черновик), сохранении, импорте и открытии разбора.
 */
export function useLessonVersions(storageId, nodes, notedRefs) {
  const key = `pithy-versions:${storageId}`
  const [versions] = useState(() => (nodes.length ? pushVersion(load(key), makeSnapshot(nodes)) : load(key)))
  const [show, setShowState] = useState(() => read(SHOW_KEY, '0') === '1')

  // Флаги «к ноде есть замечание» накладываются на верхнюю версию при расчёте (без setState в эффекте) и вместе с версиями пишутся в хранилище
  const notedKey = [...notedRefs].sort().join(',')
  const view = useMemo(() => markCommented(versions, new Set(notedKey ? notedKey.split(',') : [])), [versions, notedKey])
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(view)) } catch { /* переполнено: версии живут до закрытия окна */ } }, [key, view])

  const prev = view.length >= 2 ? view[view.length - 2] : null
  const canCompare = !!prev
  const marks = useMemo(() => (show && prev ? diffSnapshots(prev.items, makeSnapshot(nodes)) : new Map()), [show, prev, nodes])
  const setShow = v => { setShowState(v); write(SHOW_KEY, v ? '1' : '0') }
  return { canCompare, show: show && canCompare, setShow, marks, prevTime: prev?.t ?? null }
}
