import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useAdmin } from '../../../app/AdminContext.jsx'
import { signalMeta } from '../../../shared/lib/ranking/signalRegistry.js'
import { useFeedKnowledge } from '../../feed/useFeedKnowledge.js'
import { useSignalsDraft } from './useSignalsDraft.js'
import { useSignalsModules } from './useSignalsModules.js'
import { usePreviewOrders } from './usePreviewOrders.js'
import { signalStats } from './previewOrders.js'
import SignalsToolbar from './SignalsToolbar.jsx'
import EngineConfirm from './EngineConfirm.jsx'
import SignalList from './SignalList.jsx'
import SignalDetail from './SignalDetail.jsx'
import FeedPreview from './FeedPreview.jsx'
import VersionsPanel from './VersionsPanel.jsx'
import ConfigJsonPanel from './ConfigJsonPanel.jsx'
import '../../../styles/admin-signals.css'
import '../../../styles/admin-signals-list.css'
import '../../../styles/admin-signals-preview.css'

// Полноэкранное окно «Сигналы ленты» (этап 2 движка, PROJECT.md). Портал в body
// поверх оболочки и редакторов (z-index 700, см. admin-signals.css). Три колонки
// на ПК (список сигналов / карточка + история + JSON / предпросмотр ленты), на
// телефоне — вкладки между ними. Закрытие: кнопка и Esc. Элементы не прячутся через
// pointer-events — окно размонтируется сразу, клик по «закрыть» не проваливается вниз.
// learnView — данные памяти самого админа (из ShellV2 через AdminV2): по ним же
// считается его собственная лента, запросов не дублируем.
const THEME_KEY = 'pithy_admin_signals_theme_v1'
const DETAIL_TABS = [['signal', 'Сигнал'], ['history', 'История'], ['json', 'JSON']]
const VIEWS = [['list', 'Сигналы'], ['detail', 'Сигнал'], ['preview', 'Лента']]

export default function SignalsWindow({ learnView, onClose }) {
  const { user } = useAdmin()
  const model = useSignalsDraft(user?.email ?? null)
  const { modules, loading: modulesLoading, error: modulesError } = useSignalsModules()
  const { rank } = useFeedKnowledge(learnView)
  const metas = useMemo(() => signalMeta(), [])
  const [selectedId, setSelectedId] = useState(metas[0]?.id ?? null)
  const [view, setView] = useState('list') // телефон: какая колонка на экране
  const [detailTab, setDetailTab] = useState('signal')
  const [previewMode, setPreviewMode] = useState('draft') // draft | active | legacy | version
  const [versionCfg, setVersionCfg] = useState(null) // версия из истории на предпросмотре
  const [confirmEngine, setConfirmEngine] = useState(false)
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' } })
  const closeRef = useRef(null)
  const openerRef = useRef(null)

  const { orders, changed } = usePreviewOrders(modules, rank, model.draft, model.active, versionCfg)
  const selected = metas.find(m => m.id === selectedId) ?? null
  const stats = useMemo(() => (selected ? signalStats(modules, rank, selected.id) : null), [modules, rank, selected])

  // Фокус внутрь окна при открытии, обратно — при закрытии; Esc закрывает (сначала диалог)
  useEffect(() => {
    openerRef.current = document.activeElement
    closeRef.current?.focus()
    return () => openerRef.current?.focus?.()
  }, [])
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (confirmEngine) setConfirmEngine(false); else onClose()
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [confirmEngine, onClose])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    try { localStorage.setItem(THEME_KEY, next) } catch { /* приватный режим */ }
  }

  // Включение weighted — только через подтверждение внутри окна (confirm() браузер блокирует)
  const onEngine = engine => {
    if (engine === 'weighted' && model.draft.engine !== 'weighted') setConfirmEngine(true)
    else model.actions.engine(engine)
  }
  const selectSignal = id => { setSelectedId(id); setDetailTab('signal'); if (window.innerWidth < 1100) setView('detail') }
  const previewVersion = cfg => { setVersionCfg(cfg); setPreviewMode('version'); if (window.innerWidth < 1100) setView('preview') }

  const noMemory = !rank
  const win = (
    <div className="fsWin" data-theme={theme} role="dialog" aria-modal="true" aria-label="Сигналы ленты">
      <SignalsToolbar
        model={model} onEngine={onEngine} onClose={onClose} closeRef={closeRef}
        theme={theme} onToggleTheme={toggleTheme}
      />
      <div className="fsViewTabs" role="tablist" aria-label="Разделы окна">
        {VIEWS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'fsViewTab fsViewTabOn' : 'fsViewTab'} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>
      <div className="fsBody" data-view={view}>
        <section className="fsCol fsColList" aria-label="Список сигналов">
          <SignalList metas={metas} draft={model.draft} selectedId={selectedId} onSelect={selectSignal} actions={model.actions} />
        </section>
        <section className="fsCol fsColDetail" aria-label="Карточка сигнала">
          <div className="fsTabs" role="tablist" aria-label="Карточка, история, JSON">
            {DETAIL_TABS.map(([id, label]) => (
              <button key={id} role="tab" aria-selected={detailTab === id} className={detailTab === id ? 'fsTab fsTabOn' : 'fsTab'} onClick={() => setDetailTab(id)}>{label}</button>
            ))}
          </div>
          {detailTab === 'signal' && <SignalDetail meta={selected} state={selected ? model.draft.signals[selected.id] : null} draft={model.draft} stats={stats} noMemory={noMemory} />}
          {detailTab === 'history' && (
            <VersionsPanel history={model.history} active={model.active} busy={model.busy} onReload={model.loadHistory}
              onPreview={previewVersion} onRollback={model.rollback} previewingAt={previewMode === 'version' ? versionCfg?.updatedAt : null} />
          )}
          {detailTab === 'json' && <ConfigJsonPanel draft={model.draft} onApply={cfg => { model.actions.replace(cfg); model.setStatus({ kind: 'ok', text: 'JSON применён к черновику' }) }} />}
        </section>
        <section className="fsCol fsColPreview" aria-label="Предпросмотр ленты">
          <FeedPreview
            orders={orders} changed={changed} mode={previewMode} setMode={setPreviewMode} hasVersion={!!versionCfg}
            draftEngine={model.draft.engine} loading={modulesLoading} error={modulesError} noMemory={noMemory}
          />
        </section>
      </div>
      {confirmEngine && (
        <EngineConfirm
          onCancel={() => setConfirmEngine(false)}
          onConfirm={() => { model.actions.engine('weighted'); setConfirmEngine(false) }}
        />
      )}
    </div>
  )
  return createPortal(win, document.body)
}
