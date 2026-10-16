import { useState, useEffect, useCallback } from 'react'
import { closeOpenHelp } from '../signals/helpOpenState.js'
import { uiRead, uiWrite } from './ui/uiStore.js'
import { usePanelState } from './ui/usePanelState.js'
import { useColumnWidths } from './ui/useColumnWidths.js'

// Интерфейсное состояние окна сборщика (без черновика): тема окна и вкладка на телефоне
// (uiStore), панели (usePanelState: свёрнутость, полноэкранный блок, сводка линтера),
// ширины колонок (useColumnWidths) и цепочка Esc. Esc (слушатель capture на document —
// раньше React-обработчиков): открытая выпадашка слота / меню «Использовать» / диалог
// (.scbSlotOpen, [data-esc-own]) закрывает себя сама → подсказка «?» → полноэкранная панель →
// окно (onClose). Старый ключ темы pithy_admin_scenes_theme_v1 читается один раз как запасной.
const LEGACY_THEME_KEY = 'pithy_admin_scenes_theme_v1'

function readTheme() {
  const t = uiRead('theme', null, { validate: v => v === 'light' || v === 'dark' })
  if (t) return t
  try { return localStorage.getItem(LEGACY_THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

// initialView — вкладка окна на телефоне при открытии ('settings' | 'scene' | 'panel'; по умолчанию 'scene')
export function useBuilderUi({ lint, onClose, winRef, initialView = null }) {
  const [theme, setTheme] = useState(readTheme)
  const [view, setView] = useState(['settings', 'scene', 'panel'].includes(initialView) ? initialView : 'scene')
  const panels = usePanelState(lint)
  const columns = useColumnWidths()

  const toggleTheme = useCallback(() => {
    setTheme(t => { const next = t === 'dark' ? 'light' : 'dark'; uiWrite('theme', next); return next })
  }, [])

  const fullscreen = panels.fullscreen
  const exitFullscreen = panels.exitFullscreen
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      if (winRef.current?.querySelector('.scbSlotOpen, [data-esc-own]')) return
      e.stopPropagation()
      if (closeOpenHelp(true)) return
      if (fullscreen) { exitFullscreen(); return }
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose, fullscreen, exitFullscreen, winRef])

  return { theme, toggleTheme, view, setView, panels, columns }
}
