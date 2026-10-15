import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { uiRead, uiWrite } from './uiStore.js'
import { COLLAPSED_KEY, isCollapsed, toggleCollapsed, setCollapsed, expandPath, setAllCollapsed, allCollapsed, validCollapsed } from './panelModel.js'
import { panelLintState } from '../lintPanelMap.js'

// Состояние всех панелей окна сборщика (значение PanelCtx): какие свёрнуты (хранится в
// localStorage через uiStore, ключ «collapsed»), какая панель на весь экран (не хранится),
// сводка линтера по панелям (красная рамка / янтарная метка), реестр панелей по колонкам
// («Свернуть все» для окна и для колонки). Логика — panelModel.js, здесь только склейка с React.
export function usePanelState(lint) {
  const [collapsed, setCollapsedList] = useState(() => uiRead(COLLAPSED_KEY, [], { validate: validCollapsed }))
  const [fullscreen, setFullscreen] = useState(null)
  const registry = useRef(new Map()) // key → column
  const [, bump] = useState(0) // перерисовать подписи «Свернуть все» после регистрации панелей

  useEffect(() => { uiWrite(COLLAPSED_KEY, collapsed) }, [collapsed])

  const lintState = useMemo(() => panelLintState(lint), [lint])

  const register = useCallback((key, column) => {
    registry.current.set(key, column ?? null)
    bump(n => n + 1)
    return () => { registry.current.delete(key); bump(n => n + 1) }
  }, [])
  const keysOf = useCallback(column => [...registry.current].filter(([, c]) => !column || c === column).map(([k]) => k), [])

  return useMemo(() => ({
    collapsed,
    fullscreen,
    lintState,
    register,
    isCollapsed: key => isCollapsed(collapsed, key),
    toggle: key => setCollapsedList(c => toggleCollapsed(c, key)),
    set: (key, value) => setCollapsedList(c => setCollapsed(c, key, value)),
    expand: keys => setCollapsedList(c => expandPath(c, keys)),
    // column = null — все панели окна
    setAll: (column, value) => setCollapsedList(c => setAllCollapsed(c, keysOf(column), value)),
    allCollapsed: column => allCollapsed(collapsed, keysOf(column)),
    hasPanels: column => keysOf(column).some(k => !k.includes('.')),
    setFullscreen: key => setFullscreen(key),
    exitFullscreen: () => setFullscreen(null),
  }), [collapsed, fullscreen, lintState, register, keysOf])
}
