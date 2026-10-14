import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { closeOpenHelp } from '../signals/helpOpenState.js'
import { useBuilderDraft } from './useBuilderDraft.js'
import { useSceneLibrary } from './useSceneLibrary.js'
import { findField, fieldSection } from './lintFieldMap.js'
import BuilderToolbar from './BuilderToolbar.jsx'
import BuilderSettings from './BuilderSettings.jsx'
import PhonePreview from './PhonePreview.jsx'
import SidePanel from './SidePanel.jsx'
import '../../../styles/admin-signals.css'
import '../../../styles/admin-scenes-builder.css'
import '../../../styles/admin-scenes-preview.css'

// Полноэкранное окно «Сборщик сцен» (этап 2). Портал в body поверх оболочки (класс fsWin
// из окна сигналов: z-index 700, токены темы --fs-*, тёмная/светлая). ПК — три области:
// настройки / телефонная рамка с живой сценой / панель (JSON, нейросеть, библиотека);
// телефон (< 1100px) — вкладки. Закрытие: кнопка и Esc (сначала закрывается открытая
// подсказка «?», затем окно). Окно размонтируется сразу, без pointer-events:none —
// клики не проваливаются вниз; вложенные кнопки останавливают всплытие сами.
// Черновик — useBuilderDraft (бэкап в localStorage), библиотека — useSceneLibrary.
// Управляемый режим (нода урока, canvas/NodeSceneBuilderHost): initialScene — стартовая
// сцена, onApply(scene, saved) — кнопка «Применить к ноде» (без записи в библиотеку; бэкап
// черновика админа при этом не трогается; saved — { id, status } строки библиотеки, если
// черновик к ней привязан), title — заголовок окна, applyLabel — подпись кнопки,
// initialRow — строка библиотеки, из которой взята initialScene (сцена ленты).
const THEME_KEY = 'pithy_admin_scenes_theme_v1'
const VIEWS = [['settings', 'Настройки'], ['scene', 'Сцена'], ['panel', 'Панель']]

export default function BuilderWindow({ onClose, initialScene = null, initialRow = null, onApply = null, applyLabel, title = 'Сборщик сцен' }) {
  const draft = useBuilderDraft({ initialScene, initialRow, backup: !onApply })
  const library = useSceneLibrary()
  const [view, setView] = useState('scene')
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' } })
  const [status, setStatus] = useState(null) // { kind: 'ok' | 'warn' | 'error', text }
  const closeRef = useRef(null)
  const openerRef = useRef(null)
  const winRef = useRef(null)

  useEffect(() => {
    openerRef.current = document.activeElement
    closeRef.current?.focus()
    return () => openerRef.current?.focus?.()
  }, [])
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      // Слушатель capture срабатывает раньше React-обработчиков: открытая выпадашка
      // слота закрывает себя сама (SlotCell), окно этот Esc пропускает
      if (winRef.current?.querySelector('.scbSlotOpen')) return
      e.stopPropagation()
      if (closeOpenHelp(true)) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* приватный режим */ }
  }

  // Клик по замечанию линтера: подсветить поле (на телефоне — сперва открыть «Настройки»)
  const highlight = useCallback(text => {
    const go = () => {
      const el = findField(text, document)
      if (!el) return
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.setAttribute('data-flash', '1')
      setTimeout(() => el.removeAttribute('data-flash'), 1600)
      if (typeof el.focus === 'function' && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName)) el.focus({ preventScroll: true })
    }
    if (window.innerWidth < 1100 && fieldSection(text)) { setView('settings'); setTimeout(go, 60) } else go()
  }, [])

  const save = async (statusOverride) => {
    const { scene, saved } = draft
    const title = scene.title?.trim() || 'Без названия'
    const row = await library.save({ id: saved.id, title, scene, status: statusOverride ?? saved.status })
    if (row) { draft.actions.markSaved(row); setStatus({ kind: 'ok', text: `Сохранено в библиотеку: «${row.title}» (${row.status === 'published' ? 'опубликована' : 'черновик'})` }) }
    else setStatus({ kind: 'error', text: library.error || 'Не удалось сохранить' })
  }
  const openRow = async id => {
    const row = await library.open(id)
    if (row?.scene) { draft.actions.load(row.scene, row); setStatus({ kind: 'ok', text: `Открыта «${row.title}»` }); if (window.innerWidth < 1100) setView('scene') }
    else if (row === null) setStatus({ kind: 'error', text: library.error || 'Не удалось открыть' })
  }

  const win = (
    <div ref={winRef} className="fsWin scbWin" data-theme={theme} role="dialog" aria-modal="true" aria-label={title}>
      <BuilderToolbar
        draft={draft} library={library} status={status} setStatus={setStatus} title={title}
        onSave={save} onApply={onApply ? () => onApply(draft.scene, draft.saved) : null} applyLabel={applyLabel}
        onClose={onClose} closeRef={closeRef} theme={theme} onToggleTheme={toggleTheme}
      />
      <div className="fsViewTabs" role="tablist" aria-label="Разделы окна">
        {VIEWS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'fsViewTab fsViewTabOn' : 'fsViewTab'} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>
      <div className="scbBody" data-view={view}>
        <section className="scbCol scbColSettings" aria-label="Настройки сцены">
          <BuilderSettings scene={draft.scene} actions={draft.actions} savedId={draft.saved.id} setStatus={setStatus} />
        </section>
        <section className="scbCol scbColScene" aria-label="Предпросмотр сцены">
          <PhonePreview scene={draft.scene} lint={draft.lint} budget={draft.budget} onHighlight={highlight} />
        </section>
        <section className="scbCol scbColPanel" aria-label="JSON, нейросеть, библиотека">
          <SidePanel draft={draft} library={library} onOpenRow={openRow} onSave={save} setStatus={setStatus} />
        </section>
      </div>
    </div>
  )
  return createPortal(win, document.body)
}
