import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { useBuilderDraft } from './useBuilderDraft.js'
import { useSceneLibrary } from './useSceneLibrary.js'
import { useBuilderUi } from './useBuilderUi.js'
import { useBuilderActions } from './useBuilderActions.js'
import { sceneUseMode } from './ui/sceneUseOptions.js'
import { PanelCtx } from './ui/panelContext.js'
import PanelColumn from './ui/PanelColumn.jsx'
import ColumnResizer from './ui/ColumnResizer.jsx'
import CollapseAllButton from './ui/CollapseAllButton.jsx'
import BuilderToolbar from './BuilderToolbar.jsx'
import BuilderSettings from './BuilderSettings.jsx'
import PhonePreview from './PhonePreview.jsx'
import SidePanel from './SidePanel.jsx'
import { useSceneVoice } from './voice/useSceneVoice.js'
import { usePreviewModes } from './modes/usePreviewModes.js'
import VoiceAllDialog from './voice/VoiceAllDialog.jsx'
import FeedTestDialog from './feedTest/FeedTestDialog.jsx'
import { useBuilderBack } from './useBuilderBack.js'
import { returnNotice } from './feedTest/feedTestSandbox.js'
import BackConfirm from './toolbar/BackConfirm.jsx'
import '../../../styles/admin-signals.css'
import '../../../styles/admin-scenes.css'
import '../../../styles/admin-scenes-builder.css'
import '../../../styles/admin-scenes-character.css'
import '../../../styles/admin-scenes-preview.css'
import '../../../styles/admin-scenes-voice.css'
import '../../../styles/admin-scenes-panel.css'
import '../../../styles/admin-scenes-layout.css'
import '../../../styles/admin-scenes-use.css'
import '../../../styles/admin-scenes-icons.css'
import '../../../styles/admin-scenes-toolbar.css'
import '../../../styles/admin-scenes-task.css'

// Полноэкранное окно «Сборщик сцен» (этап 2). Портал в body поверх оболочки (класс fsWin
// из окна сигналов: z-index 700, токены темы --fs-*, тёмная/светлая). ПК — три колонки с
// перетаскиваемыми разделителями (ui/ColumnResizer, ширины в localStorage): настройки /
// телефонная рамка с живой сценой / панель (JSON, нейросеть, библиотека); телефон (< 1100px) —
// вкладки. Все блоки — сворачиваемые панели ui/Panel (свёрнутость хранится локально,
// «на весь экран» — нет). Закрытие: «← Назад» слева в тулбаре (при несохранённых правках —
// диалог BackConfirm, useBuilderBack) и Esc (цепочка — useBuilderUi, закрывает сразу). Окно
// размонтируется сразу, без pointer-events:none — клики не проваливаются вниз.
// Черновик — useBuilderDraft (бэкап в localStorage), библиотека — useSceneLibrary,
// сохранение/открытие/подсветка замечаний — useBuilderActions.
// Управляемый режим (нода урока, canvas/NodeSceneBuilderHost; модуль ленты, ModuleScenePanel):
// initialScene — стартовая сцена, onApply(scene, saved) — кнопка «Применить к ноде» (без записи
// в библиотеку; бэкап черновика админа не трогается; saved — { id, status } строки библиотеки),
// title — заголовок окна, applyLabel — подпись кнопки, initialRow — строка библиотеки, из
// которой взята initialScene, useMode — что значит «Использовать» в «Моих сценах»
// (node | module | admin, ui/sceneUseOptions). Озвучка ElevenLabs — useSceneVoice (voice/):
// пока идёт генерация, окно не закрывается, диалог «Озвучить всё» — VoiceAllDialog. Режимы
// показа/озвучки предпросмотра — usePreviewModes (modes/): тулбар переключает, PhonePreview показывает.
const VIEWS = [['settings', 'Настройки'], ['scene', 'Сцена'], ['panel', 'Панель']]

export default function BuilderWindow({ onClose: onCloseProp, initialScene = null, initialRow = null, onApply = null, applyLabel, title = 'Сборщик сцен', useMode = null, fromTest = null }) {
  // fromTest — окно открыто кнопкой «← Вернуться в сборщик» с тестового слайда ленты ({ origin, scene }). Обычный сборщик (origin 'admin'):
  // тот же черновик восстановится из резервной копии. Тест запускали из ноды/модуля: управляемый режим не пишет копию, поэтому окно
  // открывается с копией сцены из теста, а резервная копия админа не перезаписывается (backup=false)
  const testCopy = fromTest && fromTest.origin !== 'admin' ? fromTest.scene : null
  const draft = useBuilderDraft({ initialScene: initialScene ?? testCopy, initialRow, backup: !onApply && !testCopy })
  const library = useSceneLibrary()
  const voice = useSceneVoice(draft)
  const modes = usePreviewModes(draft)
  const voiceBusy = voice.busy
  const backRef = useRef(null)
  const openerRef = useRef(null)
  const winRef = useRef(null)
  const bodyRef = useRef(null)
  const mode = sceneUseMode({ onApply, useMode })

  const act = useBuilderActions({ draft, library, initialStatus: fromTest ? { kind: 'ok', text: returnNotice(fromTest.origin) } : null })
  const { status, setStatus } = act
  const [feedTest, setFeedTest] = useState(false)
  const openFeedTest = useCallback(() => {
    if (voiceBusy) setStatus({ kind: 'warn', text: 'Идёт озвучка — дождитесь конца, потом проверяйте в ленте' })
    else setFeedTest(true)
  }, [voiceBusy, setStatus])

  const onClose = useCallback(() => {
    if (voiceBusy) { setStatus({ kind: 'warn', text: 'Идёт озвучка — остановите её или дождитесь конца, потом закрывайте окно' }); return }
    onCloseProp()
  }, [voiceBusy, onCloseProp, setStatus])

  const back = useBuilderBack({ draft, voiceBusy, onClose, save: act.save })
  const ui = useBuilderUi({ lint: draft.lint, onClose, winRef })
  const { view, setView, panels, columns } = ui

  useEffect(() => {
    openerRef.current = document.activeElement
    backRef.current?.focus()
    return () => openerRef.current?.focus?.()
  }, [])

  // Клик по замечанию линтера: развернуть панели на пути, подсветить поле (на телефоне — сперва «Настройки»)
  const highlight = useCallback(text => act.highlight(text, { expand: panels.expand, setView }), [act, panels.expand, setView])

  const win = (
    <div ref={winRef} className="fsWin scbWin" data-theme={ui.theme} role="dialog" aria-modal="true" aria-label={title}>
      <PanelCtx.Provider value={panels}>
        <BuilderToolbar
          draft={draft} library={library} status={status} setStatus={setStatus} title={title}
          onSave={act.save} onApply={onApply ? () => onApply(draft.scene, draft.saved) : null} applyLabel={applyLabel} useMode={useMode}
          onBack={back.requestBack} backRef={backRef} unsaved={back.unsaved} voice={voice} modes={modes} theme={ui.theme} onToggleTheme={ui.toggleTheme} onFeedTest={openFeedTest}
        />
        <div className="fsViewTabs" role="tablist" aria-label="Разделы окна">
          {VIEWS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'fsViewTab fsViewTabOn' : 'fsViewTab'} onClick={() => setView(id)}>{label}</button>
          ))}
        </div>
        <div ref={bodyRef} className="scbBody" data-view={view} style={columns.style}>
          <PanelColumn name="settings">
            <section className="scbCol scbColSettings" aria-label="Настройки сцены">
              <div className="scbColTools"><CollapseAllButton column="settings" /></div>
              <BuilderSettings scene={draft.scene} actions={draft.actions} savedId={draft.saved.id} setStatus={setStatus} voice={voice} onFeedTest={openFeedTest} />
            </section>
          </PanelColumn>
          <ColumnResizer index={0} bodyRef={bodyRef} fractions={columns.fractions} onCommit={columns.commit} onReset={columns.reset} />
          <PanelColumn name="scene">
            <section className="scbCol scbColScene" aria-label="Предпросмотр сцены">
              <div className="scbColTools"><CollapseAllButton column="scene" /></div>
              <PhonePreview scene={draft.scene} lint={draft.lint} budget={draft.budget} onHighlight={highlight} modes={modes} actions={draft.actions} />
            </section>
          </PanelColumn>
          <ColumnResizer index={1} bodyRef={bodyRef} fractions={columns.fractions} onCommit={columns.commit} onReset={columns.reset} />
          <PanelColumn name="panel">
            <section className="scbCol scbColPanel" aria-label="JSON, нейросеть, библиотека">
              <div className="scbColTools"><CollapseAllButton column="panel" /></div>
              <SidePanel draft={draft} library={library} onOpenRow={act.openRow} onSave={act.save} setStatus={setStatus} mode={mode} onApplyScene={onApply} />
            </section>
          </PanelColumn>
        </div>
        <BackConfirm
          open={back.ask} embedded={mode !== 'admin'} canSave={!library.busy && !library.missingTable} busy={back.saving}
          reason={library.missingTable ? 'Таблицы scenes нет в базе — сохранить в библиотеку нельзя, черновик остаётся на этом устройстве.' : ''}
          onChoose={back.choose}
        />
        {feedTest && (
          <FeedTestDialog draft={draft} library={library} save={act.save} setStatus={setStatus} onClose={() => setFeedTest(false)} onLeave={onCloseProp} origin={testCopy ? fromTest.origin : mode} />
        )}
        <VoiceAllDialog
          all={voice.all} quota={voice.quota} names={{ a: draft.scene.characters.a.name, b: draft.scene.characters.b.name }}
          onStart={voice.startAll} onStop={voice.stopAll} onClose={voice.closeAll} onSets={voice.setSets}
        />
      </PanelCtx.Provider>
    </div>
  )
  return createPortal(win, document.body)
}
