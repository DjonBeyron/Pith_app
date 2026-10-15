import { createContext, useContext } from 'react'

// Контексты панелей сборщика: PanelCtx — состояние свёрнутости/полноэкранного режима/
// сводки линтера (из usePanelState.js, провайдер — BuilderWindow); ColumnCtx — имя колонки
// («settings» / «scene» / «panel»), в которой лежит панель: нужно для «Свернуть все» по колонке
// (провайдер — PanelColumn.jsx). Panel.jsx работает и без провайдера (локальное состояние) —
// так его рендерят тесты без окна.

export const PanelCtx = createContext(null)
export const ColumnCtx = createContext(null)

export const usePanels = () => useContext(PanelCtx)
export const useColumnName = () => useContext(ColumnCtx)
